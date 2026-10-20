"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Mail,
  Calendar,
  Shield,
  KeyRound,
  LogOut,
  Loader2,
  Camera,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { uploadAvatar, removeAvatar } from "@/lib/avatar";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { InstallAppCard } from "@/components/InstallAppCard";
import { NotificationPrefs } from "@/components/NotificationPrefs";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [picBusy, setPicBusy] = useState(false);
  const [picMsg, setPicMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onPickPicture(file: File | undefined) {
    if (!file || !user || demoMode) return;
    setPicBusy(true); setPicMsg(null);
    try { await uploadAvatar(user.uid, file); setPicMsg({ ok: true, text: "Picture updated." }); }
    catch (e) { setPicMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't upload that picture." }); }
    finally { setPicBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function onRemovePicture() {
    if (!user || demoMode) return;
    setPicBusy(true); setPicMsg(null);
    try { await removeAvatar(user.uid); setPicMsg({ ok: true, text: "Picture removed." }); }
    catch (e) { setPicMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't remove the picture." }); }
    finally { setPicBusy(false); }
  }

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
            <div className="relative mb-3">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={picBusy || demoMode} className="block rounded-full focus:outline-none focus:ring-2 focus:ring-gold/60 disabled:opacity-70" aria-label="Change profile picture">
                <Avatar src={state.profile.photoURL} name={state.profile.name} email={state.profile.email} id={user?.uid ?? state.profile.email} size={84} ring="ring-2 ring-gold/50" />
              </button>
              <span className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-full bg-gold text-gold-dark flex items-center justify-center ring-2 ring-card pointer-events-none">
                {picBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onPickPicture(e.target.files?.[0])} />
            </div>
            <p className="text-[16px] font-medium m-0">{state.profile.name}</p>
            <p className="text-[11px] text-text-muted m-0 mt-0.5">{state.profile.email}</p>
            <div className="flex items-center gap-3 mt-2.5 text-[11px]">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={picBusy || demoMode} className="text-gold hover:underline disabled:opacity-50">{state.profile.photoURL ? "Change picture" : "Add a picture"}</button>
              {state.profile.photoURL && <button type="button" onClick={onRemovePicture} disabled={picBusy} className="text-text-muted hover:text-red flex items-center gap-1 disabled:opacity-50"><Trash2 className="w-3 h-3" /> Remove</button>}
            </div>
            {picMsg ? <p className={`text-[10px] m-0 mt-1.5 ${picMsg.ok ? "text-green" : "text-red"}`}>{picMsg.text}</p> : <p className="text-[10px] text-text-subtle m-0 mt-1.5">JPG, PNG or WebP · cropped square · up to 5 MB</p>}
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

          <NotificationPrefs />

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
