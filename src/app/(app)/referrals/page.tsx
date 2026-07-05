"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Share2,
  Users,
  Coins,
  Wallet,
  Clock,
  Lock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useUserState } from "@/lib/useUserState";
import { useReferralCode, useReferralTransactions, countReferredUsers } from "@/lib/useReferrals";
import { readReferralWallet, transferReferralToWallet, type ReferralStatus } from "@/lib/referrals";

const STATUS_LABEL: Record<ReferralStatus, string> = {
  queued: "Processing",
  released: "Available",
  pending: "Pending",
  locked: "Locked",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<ReferralStatus, string> = {
  queued: "bg-blue/15 text-blue",
  released: "bg-green/15 text-green",
  pending: "bg-gold/15 text-gold",
  locked: "bg-vault/15 text-vault",
  cancelled: "bg-red/15 text-red",
};

export default function ReferralsPage() {
  const { user, demoMode } = useAuth();
  const { state } = useUserState();
  const { link, loading: codeLoading } = useReferralCode();
  const { rows, loading: rowsLoading } = useReferralTransactions("me");

  const wallet = readReferralWallet(state);
  const referredCount = countReferredUsers(rows);

  const [copied, setCopied] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy — long-press the link to copy it manually.");
    }
  }

  async function moveToWallet() {
    setError(null);
    if (demoMode || !user) {
      setError("Connect an account to move your referral earnings.");
      return;
    }
    if (wallet.available <= 0) return;
    const { db } = getFirebase();
    if (!db) return;
    setMoving(true);
    try {
      await transferReferralToWallet(db, user.uid, wallet.available);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setMoving(false);
    }
  }

  return (
    <div>
      <TopHeader
        title="Referrals"
        subtitle="Invite friends — earn a bonus when they activate a plan"
      />

      {/* Referral link */}
      <Card className="mb-3">
        <CardHeader
          title="Your referral link"
          subtitle="Share it — new sign-ups are linked to you automatically"
          right={<Share2 className="w-4 h-4 text-gold" />}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0 bg-canvas border border-border rounded-lg px-3 py-2.5 font-mono text-[12px] text-text truncate flex items-center">
            {codeLoading ? "Generating your link…" : link ?? "Sign in to get your link"}
          </div>
          <button
            onClick={copyLink}
            disabled={!link}
            className={cn(
              "shrink-0 px-4 py-2.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50",
              copied ? "bg-green text-white" : "bg-gold text-gold-dark hover:brightness-110"
            )}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <Stat icon={Users} label="Referred investors" value={String(referredCount)} tone="text" />
        <Stat icon={Coins} label="Total earned" value={formatPHP(wallet.totalEarned)} tone="green" />
        <Stat icon={Wallet} label="Available" value={formatPHP(wallet.available)} tone="green" />
        <Stat icon={Clock} label="Pending" value={formatPHP(wallet.pending)} tone="gold" />
        <Stat icon={Lock} label="Locked" value={formatPHP(wallet.locked)} tone="vault" />
        <Stat
          icon={ArrowRight}
          label="Moved to wallet"
          value={formatPHP(wallet.totalWithdrawn)}
          tone="text"
        />
      </div>

      {/* Move available to wallet */}
      <Card className="mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-text m-0">Move earnings to wallet</p>
            <p className="text-[11px] text-text-subtle mt-0.5 m-0">
              Available referral balance can be spent or withdrawn from your main wallet. Pending
              and locked balances aren&apos;t transferable yet.
            </p>
          </div>
          <button
            onClick={moveToWallet}
            disabled={moving || wallet.available <= 0}
            className="shrink-0 px-4 py-2.5 rounded-lg text-[12px] font-medium bg-green text-white flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {moving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
            Move {formatPHP(wallet.available)} to wallet
          </button>
        </div>
        {error && <p className="text-[11px] text-red mt-2 m-0">{error}</p>}
      </Card>

      {/* History */}
      <Card>
        <CardHeader title="Referral history" subtitle="Bonuses from plans your referrals activated" />
        {rowsLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-text-muted text-center py-10 m-0">
            No referral bonuses yet. Share your link to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-text-subtle border-b border-border">
                  <th className="text-left font-normal py-2 pr-3">Referral</th>
                  <th className="text-left font-normal py-2 pr-3">Plan</th>
                  <th className="text-right font-normal py-2 pr-3">Amount</th>
                  <th className="text-right font-normal py-2 pr-3">Bonus</th>
                  <th className="text-left font-normal py-2 pr-3">Status</th>
                  <th className="text-right font-normal py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-3 text-text truncate max-w-[120px]">
                      {r.referredUserName || r.referredUserId.slice(0, 6)}
                    </td>
                    <td className="py-2.5 pr-3 text-text-muted truncate max-w-[120px]">{r.planName}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-text-muted">
                      {formatPHP(r.planAmount, { short: true })}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-green">
                      {formatPHP(r.referralBonusAmount)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium",
                          STATUS_TONE[r.status]
                        )}
                      >
                        {STATUS_LABEL[r.status]}
                        {r.status === "locked" && r.releaseDate
                          ? ` · ${new Date(r.releaseDate).toLocaleDateString()}`
                          : ""}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-text-subtle whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone: "text" | "green" | "gold" | "vault";
}) {
  const color =
    tone === "green"
      ? "text-green"
      : tone === "gold"
      ? "text-gold"
      : tone === "vault"
      ? "text-vault"
      : "text-text";
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">{label}</p>
      </div>
      <p className={cn("text-[18px] font-medium font-mono m-0", color)}>{value}</p>
    </Card>
  );
}
