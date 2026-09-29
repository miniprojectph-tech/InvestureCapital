"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { ensureUserDoc } from "./userState";
import { attachReferrer, ensureReferralCode } from "./referrals";

type AuthUser = {
  uid: string;
  email: string;
  name: string;
  initials: string;
  isAdmin: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** True when no Firebase keys are configured — app runs in mock mode. */
  demoMode: boolean;
  /** `remember` false = signed out when the browser closes; true = stays signed in on this device. */
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  /** True when the account has a password (false = Google sign-in only). */
  hasPassword: boolean;
  /** Confirm it's really the member (password, or the Google pop-up) before a sensitive action. */
  confirmIdentity: (currentPassword?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signUp: (
    name: string,
    email: string,
    password: string,
    referralCode?: string
  ) => Promise<void>;
  signInWithGoogle: (referralCode?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function initialsFrom(name: string, email: string) {
  const source = name?.trim() || email?.split("@")[0] || "U";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function toAuthUser(u: User, isAdmin = false): AuthUser {
  return {
    uid: u.uid,
    email: u.email ?? "",
    name: u.displayName || u.email?.split("@")[0] || "Investor",
    initials: initialsFrom(u.displayName ?? "", u.email ?? ""),
    isAdmin,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, db } = getFirebase();
  const demoMode = !auth;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      // Tear down any previous doc listener
      unsubDoc?.();
      unsubDoc = undefined;

      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const u = toAuthUser(fbUser);
      setUser(u);

      if (db) {
        ensureUserDoc(db, u.uid, u.name, u.email).catch((err) =>
          console.error("ensureUserDoc on auth change failed", err)
        );

        // Live-track isAdmin from the user's Firestore doc so a manual
        // role change in the console takes effect without a re-login.
        unsubDoc = onSnapshot(
          doc(db, "users", u.uid),
          (snap) => {
            const isAdmin = snap.exists() && snap.data().isAdmin === true;
            // Only produce a NEW user object when the role actually changed. The
            // doc updates on every wallet/placement/payout-method write, and a
            // fresh object each time made every hook keyed on `user` re-subscribe
            // (pages flashed their loading state and open modals lost their
            // "success" screen).
            setUser((prev) => (prev && prev.isAdmin !== isAdmin ? { ...prev, isAdmin } : prev));
            setLoading(false);
          },
          (err) => {
            console.error("user doc subscription error", err);
            setLoading(false);
          }
        );
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, [auth, db]);

  const [hasPassword, setHasPassword] = useState(false);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setHasPassword(!!u?.providerData.some((p) => p.providerId === "password")));
  }, [auth]);

  async function signIn(email: string, password: string, remember = true) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function confirmIdentity(currentPassword?: string) {
    const u = auth?.currentUser;
    if (!auth || !u) throw new Error("Please sign in again.");
    if (u.providerData.some((p) => p.providerId === "password")) {
      if (!currentPassword) throw new Error("Enter your current password.");
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? "", currentPassword));
    } else {
      await reauthenticateWithPopup(u, new GoogleAuthProvider());
    }
    await u.getIdToken(true); // so the server sees the fresh sign-in time
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const u = auth?.currentUser;
    if (!auth || !u) throw new Error("Please sign in again.");
    if (newPassword.length < 8) throw new Error("Use at least 8 characters for the new password.");
    if (newPassword === currentPassword) throw new Error("The new password must be different from the current one.");
    await confirmIdentity(currentPassword);
    await updatePassword(u, newPassword);
  }

  async function signUp(
    name: string,
    email: string,
    password: string,
    referralCode?: string
  ) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    const authUser = toAuthUser({ ...cred.user, displayName: name } as User);
    setUser(authUser);
    if (db) {
      await ensureUserDoc(db, authUser.uid, authUser.name, authUser.email);
      await setupReferralOnJoin(authUser.uid, referralCode);
    }
  }

  /** Give a new/returning account its referral code and attach a referrer if
   *  they arrived via ?ref=CODE. Idempotent and best-effort — never blocks auth. */
  async function setupReferralOnJoin(uid: string, referralCode?: string) {
    if (!db) return;
    try {
      await ensureReferralCode(db, uid);
      if (referralCode) await attachReferrer(db, uid, referralCode);
    } catch (err) {
      console.error("referral setup on join failed", err);
    }
  }

  async function signInWithGoogle(referralCode?: string) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const authUser = toAuthUser(cred.user);
    setUser(authUser);
    if (db) {
      await ensureUserDoc(db, authUser.uid, authUser.name, authUser.email);
      // attachReferrer only sets referredByUserId when it's still empty, so
      // running this on every Google sign-in is safe for returning users.
      await setupReferralOnJoin(authUser.uid, referralCode);
    }
  }

  async function resetPassword(email: string) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    await sendPasswordResetEmail(auth, email);
  }

  async function signOut() {
    if (!auth) return;
    await fbSignOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, demoMode, signIn, signUp, signInWithGoogle, resetPassword, signOut, hasPassword, confirmIdentity, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
