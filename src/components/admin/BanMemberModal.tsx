"use client";

import { useState } from "react";
import { Loader2, Ban as BanIcon } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { banMember, type BanMoney } from "@/lib/moderation";

type Member = { uid: string; name: string; email: string };

/** Admin › Investors: ban a member (reason, length, money, and what else to block). */
export function BanMemberModal({ member, onClose, onDone }: { member: Member | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Modal open={!!member} onClose={onClose} title={member ? `Ban ${member.name || member.email}?` : "Ban"} maxWidth="max-w-md">
      {member && <BanForm key={member.uid} member={member} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function Choice({ on, onClick, title, sub, kind = "radio" }: { on: boolean; onClick: () => void; title: string; sub: string; kind?: "radio" | "check" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn("w-full flex items-start gap-2.5 text-left px-3 py-2 rounded-lg border transition", on ? "border-red/50 bg-red/5" : "border-border hover:bg-card-elev")}>
      <span className={cn("mt-0.5 w-3.5 h-3.5 shrink-0 border-2", kind === "radio" ? "rounded-full" : "rounded", on ? "border-red bg-red" : "border-border-strong")} />
      <span className="min-w-0">
        <span className="block text-[12px] text-text">{title}</span>
        <span className="block text-[10px] text-text-subtle mt-0.5">{sub}</span>
      </span>
    </button>
  );
}

function BanForm({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<7 | 30 | null>(null);
  const [money, setMoney] = useState<BanMoney>("freeze");
  const [banIp, setBanIp] = useState(true);
  const [ipDays, setIpDays] = useState<7 | 30 | null>(30);
  const [banPayout, setBanPayout] = useState(true);
  const [banDevice, setBanDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await banMember({ uid: member.uid, reason, days, money, banIp, ipDays, banPayout, banDevice });
      const extra = [r.blocked.ip ? "IP" : "", r.blocked.payout ? "payout account" : "", r.blocked.devices ? "device" : ""].filter(Boolean);
      onDone(`${member.name || member.email} is banned${days ? ` for ${days} days` : ""}.${extra.length ? ` Also blocked: ${extra.join(", ")}.` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not ban this member.");
    } finally { setBusy(false); }
  }

  const seg = (v: 7 | 30 | null, cur: 7 | 30 | null, set: (x: 7 | 30 | null) => void, label: string) => (
    <button type="button" onClick={() => set(v)} className={cn("px-3 py-1.5 text-[11px] transition", cur === v ? "bg-red text-white font-medium" : "text-text-muted hover:text-text")}>{label}</button>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted m-0">They&apos;re signed out now and can&apos;t sign in. Their email stays taken, so it can&apos;t be used to sign up again. You can unban them later.</p>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Reason (only admins see it)</span>
        <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. creating dummy accounts, scamming members" className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-red/50" />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">How long</span>
        <div className="inline-flex self-start rounded-lg border border-border overflow-hidden">{seg(7, days, setDays, "7 days")}{seg(30, days, setDays, "30 days")}{seg(null, days, setDays, "Permanent")}</div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-muted">Their money</span>
        <Choice on={money === "freeze"} onClick={() => setMoney("freeze")} title="Freeze everything" sub="Payouts wait and nothing can be withdrawn. Anything due is paid if you unban them." />
        <Choice on={money === "hold"} onClick={() => setMoney("hold")} title="Keep placements running, hold withdrawals" sub="Payouts still go to their wallet; nothing can be withdrawn." />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-muted">Also block</span>
        <Choice kind="check" on={banIp} onClick={() => setBanIp((v) => !v)} title="Their last IP address" sub="New accounts from it are flagged. Sign-ups and sign-ins from it are refused once the login upgrade is on. Mobile IPs can be shared, so keep it short." />
        {banIp && (
          <div className="inline-flex self-start ml-6 rounded-lg border border-border overflow-hidden">{seg(7, ipDays, setIpDays, "7 days")}{seg(30, ipDays, setIpDays, "30 days")}{seg(null, ipDays, setIpDays, "Permanent")}</div>
        )}
        <Choice kind="check" on={banPayout} onClick={() => setBanPayout((v) => !v)} title="Their GCash / bank account" sub="Any other account using it is flagged and its withdrawals are held." />
        <Choice kind="check" on={banDevice} onClick={() => setBanDevice((v) => !v)} title="Their phone or browser" sub="New sign-ups from the same device are flagged." />
      </div>

      {error && <p className="text-[11px] text-red m-0">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
        <button type="button" onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-red text-white text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BanIcon className="w-3.5 h-3.5" />} Ban account
        </button>
      </div>
      <p className="text-[10px] text-text-subtle m-0">Saved to the admin audit with your name and the reason.</p>
    </div>
  );
}
