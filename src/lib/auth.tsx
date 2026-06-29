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
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirebase } from "./firebase";

type AuthUser = {
  uid: string;
  email: string;
  name: string;
  initials: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** True when no Firebase keys are configured — app runs in mock mode. */
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
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

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    email: u.email ?? "",
    name: u.displayName || u.email?.split("@")[0] || "Investor",
    initials: initialsFrom(u.displayName ?? "", u.email ?? ""),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = getFirebase();
  const demoMode = !auth;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser ? toAuthUser(fbUser) : null);
      setLoading(false);
    });
    return unsub;
  }, [auth]);

  async function signIn(email: string, password: string) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signUp(name: string, email: string, password: string) {
    if (!auth) throw new Error("Firebase is not configured. Add your keys to .env.local.");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    setUser(toAuthUser({ ...cred.user, displayName: name } as User));
  }

  async function signOut() {
    if (!auth) return;
    await fbSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading, demoMode, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
