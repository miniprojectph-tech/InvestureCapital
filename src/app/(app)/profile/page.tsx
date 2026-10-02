"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Mail,
  Calendar,
  Shield,
  KeyRound,
  LogOut,
  Loader2,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { InstallAppCard } from "@/components/InstallAppCard";
import Link from "next/link";
import { ChangePasswordModal } from "@/components/AccountSecurityModals";
import { useAuth } from "@/lib/auth";
import { useUserState } from "@/lib/useUserState";

export default function ProfilePage() {
  const { user, signOut, demoMode, hasPassword } = useAuth();
  const { state, loading } = useUserState();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.push("/login");
  }

  if (loading || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const joined = new Date(state.profile.joinedAt);

  return (
    <div>
      <TopHeader title="Profile" subtitle="Your account details and preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3">
        <Card>
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue/30 to-blue/10 text-blue text-[24px] font-medium flex items-center justify-center ring-2 ring-blue/20 mb-3">
              {user?.initials ?? "U"}
            </div>
            <p className="text-[16px] font-medium m-0">{state.profile.name}</p>
            <p className="text-[11px] text-text-muted m-0 mt-0.5">{state.profile.email}</p>
            {user?.isAdmin && (
              <span className="mt-3 text-[10px] font-medium bg-vault/15 text-vault px-2 py-0.5 rounded-full">
                Admin
              </span>
            )}
            {demoMode && (
              <span className="mt-3 text-[10px] font-medium bg-blue/15 text-blue px-2 py-0.5 rounded-full">
                Demo mode
              </span>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader title="Account information" />
            <div className="flex flex-col gap-2.5">
              <Row icon={UserIcon} label="Display name" value={state.profile.name} />
              <Row icon={Mail} label="Email" value={state.profile.email} />
              <Row
                icon={Calendar}
                label="Joined"
                value={joined.toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              />
              <Row
                icon={Shield}
                label="Role"
                value={user?.isAdmin ? "Admin" : "Investor"}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Security" />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setPasswordOpen(true)}
                disabled={demoMode}
                className="flex items-center justify-between px-3 py-2.5 bg-canvas border border-border rounded-lg text-[12px] text-text hover:bg-card-elev transition text-left disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-text-muted" />
                  Change password
                </span>
                <span className="text-text-subtle text-[10px]">{hasPassword ? "Update" : "Google sign-in"}</span>
              </button>
              <button
                onClick={handleSignOut}
                disabled={busy}
                className="flex items-center gap-2 px-3 py-2.5 bg-canvas border border-border rounded-lg text-[12px] text-text hover:bg-card-elev transition disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 text-text-muted" />
                )}
                Sign out
              </button>
            </div>
          </Card>

          <InstallAppCard />

          {/* Accounts are closed by the admin team only, never from the member side. */}
          <Card>
            <CardHeader title="Closing your account" />
            <div className="flex items-center justify-between gap-3 p-3 bg-canvas border border-border rounded-lg">
              <p className="text-[11px] text-text-muted m-0 min-w-0">
                To close your account, message the admin. We&apos;ll settle any balance with you first.
              </p>
              <Link href="/community#admin" className="px-3 py-1.5 border border-border-strong rounded-md text-[11px] text-text shrink-0 hover:bg-card-elev">
                Message the admin
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-card-elev transition">
      <Icon className="w-3.5 h-3.5 text-text-subtle" />
      <span className="text-[11px] text-text-muted flex-1">{label}</span>
      <span className="text-[12px] text-text font-medium truncate max-w-[60%] text-right">
        {value}
      </span>
    </div>
  );
}
