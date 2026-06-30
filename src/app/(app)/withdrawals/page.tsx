"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { WithdrawModal } from "@/components/WithdrawModal";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { withdrawFromWallet } from "@/lib/userState";

type Filter = "all" | "approved" | "pending" | "rejected";

const mockHistory = [
  { id: "w1", amount: 500, status: "approved", at: Date.now() - 3 * 86400000, dest: "BPI ···· 3421" },
  { id: "w2", amount: 1200, status: "approved", at: Date.now() - 12 * 86400000, dest: "BPI ···· 3421" },
  { id: "w3", amount: 250, status: "approved", at: Date.now() - 21 * 86400000, dest: "BPI ···· 3421" },
];

const statusMeta = {
  approved: { label: "Approved", icon: CheckCircle2, color: "text-green", bg: "bg-green/15" },
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red", bg: "bg-red/15" },
};

export default function WithdrawalsPage() {
  const { state, loading } = useUserState();
  const { user, demoMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  async function handleWithdraw(amount: number) {
    if (demoMode || !user) return;
    const { db } = getFirebase();
    if (!db) return;
    await withdrawFromWallet(db, user.uid, amount);
  }

  if (loading || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const filtered =
    filter === "all" ? mockHistory : mockHistory.filter((h) => h.status === filter);

  const totalWithdrawn = mockHistory
    .filter((h) => h.status === "approved")
    .reduce((s, h) => s + h.amount, 0);

  return (
    <div>
      <TopHeader title="Withdrawals" subtitle="Request and track payouts from your wallet" />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-3 items-stretch">
        <Card>
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1">
            Available to withdraw
          </p>
          <p className="text-[28px] font-mono font-medium m-0 leading-none tabular-nums">
            {formatPHP(state.balances.wallet)}
          </p>
          <div className="flex gap-4 mt-3 text-[11px]">
            <span className="text-text-subtle">
              All-time withdrawn{" "}
              <span className="text-text font-mono ml-1">
                {formatPHP(totalWithdrawn, { short: true })}
              </span>
            </span>
            <span className="text-text-subtle">
              Default bank{" "}
              <span className="text-text font-mono ml-1">BPI ···· 3421</span>
            </span>
          </div>
        </Card>
        <button
          onClick={() => setOpen(true)}
          disabled={state.balances.wallet <= 0}
          className="px-5 py-3 bg-gold text-gold-dark rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed self-stretch"
        >
          <ArrowUpRight className="w-4 h-4" />
          Request withdrawal
        </button>
      </div>

      <Card>
        <CardHeader
          title={`Withdrawal history (${filtered.length})`}
          right={
            <div className="flex gap-1">
              {(["all", "approved", "pending", "rejected"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-[10px] px-2.5 py-1 rounded-full transition capitalize",
                    filter === f
                      ? "bg-gold/15 text-gold font-medium"
                      : "text-text-subtle hover:text-text"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        />

        {filtered.length === 0 && (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">
            No withdrawals match this filter yet.
          </p>
        )}
        {filtered.map((row, i) => {
          const meta = statusMeta[row.status as keyof typeof statusMeta];
          const Icon = meta.icon;
          return (
            <div
              key={row.id}
              className={cn(
                "flex items-center gap-3 py-2.5",
                i < filtered.length - 1 && "border-b border-border"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  meta.bg
                )}
              >
                <Icon className={cn("w-4 h-4", meta.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">{formatPHP(row.amount)} to {row.dest}</p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5">
                  {new Date(row.at).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-md font-medium",
                  meta.bg,
                  meta.color
                )}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </Card>

      <WithdrawModal
        open={open}
        onClose={() => setOpen(false)}
        availableBalance={state.balances.wallet}
        onSubmit={handleWithdraw}
      />
    </div>
  );
}
