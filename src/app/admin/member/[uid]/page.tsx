"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Eye, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { useRealAuth, type AuthContextValue } from "@/lib/auth";
import { ViewAsContext, type ViewAsValue } from "@/lib/viewAs";
import { ViewOnlyGuard } from "@/components/admin/ViewOnlyGuard";
import { AdminTabs, useHashTab } from "@/components/admin/AdminTabs";

/**
 * Admin › Investors › View: the member's own money screens, exactly as they
 * see them, for troubleshooting together. View only — see lib/viewAs.
 */

const loading = () => (
  <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
);
// The real member pages, loaded only when their tab is opened.
const SCREENS = [
  { key: "dashboard", label: "Dashboard", C: dynamic(() => import("@/app/(app)/dashboard/page"), { ssr: false, loading }) },
  { key: "plans", label: "My plans", C: dynamic(() => import("@/app/(app)/plans/page"), { ssr: false, loading }) },
  { key: "wallet", label: "Wallet", C: dynamic(() => import("@/app/(app)/wallet/page"), { ssr: false, loading }) },
  { key: "bonuses", label: "Bonuses", C: dynamic(() => import("@/app/(app)/bonuses/page"), { ssr: false, loading }) },
  { key: "referrals", label: "Referrals", C: dynamic(() => import("@/app/(app)/referrals/page"), { ssr: false, loading }) },
  { key: "withdrawals", label: "Withdrawals", C: dynamic(() => import("@/app/(app)/withdrawals/page"), { ssr: false, loading }) },
  { key: "transactions", label: "Transactions", C: dynamic(() => import("@/app/(app)/transactions/page"), { ssr: false, loading }) },
] as const;
type ScreenKey = (typeof SCREENS)[number]["key"];
const SCREEN_KEYS = SCREENS.map((s) => s.key);

const initialsOf = (name: string, email: string) =>
  (name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("") || email[0] || "?").toUpperCase();

export default function AdminMemberViewPage() {
  const { uid } = useParams<{ uid: string }>();
  const real = useRealAuth();
  const [member, setMember] = useState<{ name: string; email: string; isAdmin: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useHashTab<ScreenKey>(SCREEN_KEYS, "dashboard");

  useEffect(() => {
    let cancelled = false;
    setMember(null);
    setError(null);
    const { db } = getFirebase();
    if (!db || !uid) return;
    getDoc(doc(db, "users", uid))
      .then((s) => {
        if (cancelled) return;
        if (!s.exists()) return setError("This member no longer exists.");
        const d = s.data() as { profile?: { name?: string; email?: string }; isAdmin?: boolean };
        setMember({ name: d.profile?.name || "Member", email: d.profile?.email || "", isAdmin: d.isAdmin === true });
      })
      .catch(() => { if (!cancelled) setError("Could not load this member. Check your connection and try again."); });
    return () => { cancelled = true; };
  }, [uid]);

  // The stand-in identity the member pages read with. Built once per member so the
  // pages' data hooks don't re-subscribe on every render. Every account action throws.
  const view = useMemo<ViewAsValue | null>(() => {
    if (!member || !uid) return null;
    const refuse = async () => { throw new Error("View only — nothing can be changed from here."); };
    const auth: AuthContextValue = {
      user: { uid, email: member.email, name: member.name, initials: initialsOf(member.name, member.email), isAdmin: false },
      loading: false,
      demoMode: false,
      hasPassword: true,
      signIn: refuse,
      signUp: refuse,
      signInWithGoogle: refuse,
      resetPassword: refuse,
      signOut: refuse,
      confirmIdentity: refuse,
      changePassword: refuse,
    };
    return { uid, name: member.name, email: member.email, auth };
  }, [uid, member]);

  if (!real.user?.isAdmin) return null;
  const Screen = SCREENS.find((s) => s.key === tab)!.C;

  return (
    <div>
      {/* The admin's own bar: always clear that this is someone else's account, and view-only. */}
      <div className="sticky top-0 z-30 -mx-1 px-1 pb-2 bg-canvas">
        <div className="rounded-xl border border-[#F5C66B]/40 bg-[#F5C66B]/10 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/admin/investors" className="text-[11px] text-text-muted hover:text-text flex items-center gap-1 shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" /> Investors
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Eye className="w-4 h-4 text-[#F5C66B] shrink-0" />
            <p className="text-[12px] m-0 min-w-0 truncate">
              <span className="text-[#F5C66B] font-medium">View only</span>
              {member ? <> · you are seeing <span className="font-medium text-text">{member.name}</span>&apos;s account{member.email ? <span className="text-text-subtle"> · {member.email}</span> : null}</> : " · loading member…"}
            </p>
          </div>
        </div>
        <AdminTabs sticky={false} className="mb-0 pb-0" tabs={SCREENS.map((s) => ({ id: s.key, label: s.label }))} value={tab} onChange={setTab} />
      </div>

      {error ? (
        <p className="text-[12px] text-red m-0 py-10 flex items-center justify-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</p>
      ) : !view ? (
        loading()
      ) : (
        <ViewAsContext.Provider value={view}>
          <ViewOnlyGuard>
            {/* key: switching member or screen starts that screen fresh */}
            <Screen key={`${uid}:${tab}`} />
          </ViewOnlyGuard>
        </ViewAsContext.Provider>
      )}
    </div>
  );
}
