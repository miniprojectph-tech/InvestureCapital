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
  signIn: (email: string, password: string) => Promise<void>;
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
            setUser((prev) => (prev ? { ...prev, isAdmin } : prev));
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

  async function signIn(email: string, password: string) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    await signInWithEmailAndPassword(auth, email, password);
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
      value={{ user, loading, demoMode, signIn, signUp, signInWithGoogle, resetPassword, signOut }}
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
