"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Building2,
  Wallet,
  Pencil,
  Plus,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { WithdrawModal } from "@/components/WithdrawModal";
import { PayoutMethodModal } from "@/components/PayoutMethodModal";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { requestWithdrawal, useWithdrawals } from "@/lib/withdrawals";
import {
  savePayoutMethod,
  formatPayoutDestination,
  shortPayoutLabel,
  PAYOUT_METHOD_LABELS,
  type PayoutMethodType,
} from "@/lib/payoutMethod";

type Filter = "all" | "approved" | "pending" | "rejected";

const statusMeta = {
  approved: { label: "Approved", icon: CheckCircle2, color: "text-green", bg: "bg-green/15" },
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red", bg: "bg-red/15" },
};

export default function WithdrawalsPage() {
  const { state, loading: stateLoading } = useUserState();
  const { user, demoMode } = useAuth();
  const { rows: history, loading: historyLoading } = useWithdrawals("me");
  const [open, setOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const payoutMethod = state?.payoutMethod;

  async function handleWithdraw(amount: number) {
    if (demoMode) throw new Error("Withdrawals aren't available in demo mode.");
    if (!user || !payoutMethod) return;
    const { db } = getFirebase();
    if (!db) return;
    await requestWithdrawal(db, {
      userId: user.uid,
      userName: user.name,
      userEmail: user.email,
      amount,
      destination: formatPayoutDestination(payoutMethod),
    });
  }

  async function handleSavePayout(draft: {
    type: PayoutMethodType;
    accountName: string;
    accountNumber: string;
    bankName?: string;
  }) {
    if (demoMode) throw new Error("Sign in to save a payout method — demo mode is read-only.");
    if (!user) return;
    const { db } = getFirebase();
    if (!db) return;
    await savePayoutMethod(db, user.uid, draft);
  }

  function openWithdraw() {
    if (!payoutMethod) {
      // No destination yet — steer them to set one up first.
      setPayoutOpen(true);
      return;
    }
    setOpen(true);
  }

  if (stateLoading || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const filtered =
    filter === "all" ? history : history.filter((h) => h.status === filter);

  const totalApproved = history
    .filter((h) => h.status === "approved")
    .reduce((s, h) => s + h.amount, 0);

  const totalPending = history
    .filter((h) => h.status === "pending")
    .reduce((s, h) => s + h.amount, 0);

  return (
    <div>
      <TopHeader title="Withdrawals" subtitle="Request and track payouts from your wallet" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3 items-stretch">
        {/* Part 1 — Available to withdraw */}
        <Card>
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1">
            Available to withdraw
          </p>
          <p className="text-[28px] font-mono font-medium m-0 leading-none tabular-nums">
            {formatPHP(state.balances.wallet)}
          </p>
          <div className="flex gap-4 mt-3 text-[11px] flex-wrap">
            <span className="text-text-subtle">
              In escrow (pending){" "}
              <span className="text-vault font-mono ml-1">
                {formatPHP(totalPending, { short: true })}
              </span>
            </span>
            <span className="text-text-subtle">
              All-time approved{" "}
              <span className="text-text font-mono ml-1">
                {formatPHP(totalApproved, { short: true })}
              </span>
            </span>
          </div>
          <button
            onClick={openWithdraw}
            disabled={state.balances.wallet <= 0}
            className="mt-4 w-full px-5 py-3 bg-gold text-gold-dark rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowUpRight className="w-4 h-4" />
            Request withdrawal
          </button>
          {state.balances.wallet > 0 && !payoutMethod && (
            <p className="text-[10px] text-text-subtle text-center mt-2 m-0">
              Set up a mode of payout first
            </p>
          )}
        </Card>

        {/* Part 2 — Mode of payout */}
        <Card>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1">
                Mode of payout
              </p>
              <p className="text-[11px] text-text-muted m-0">
                Where approved withdrawals are sent
              </p>
            </div>
            <button
              onClick={() => setPayoutOpen(true)}
              className="text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 bg-gold/15 text-gold hover:bg-gold/25 transition"
            >
              {payoutMethod ? (
                <>
                  <Pencil className="w-3 h-3" /> Edit
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3" /> Add
                </>
              )}
            </button>
          </div>

          {payoutMethod ? (
            <div className="flex items-center gap-3 px-3 py-3 bg-canvas border border-border rounded-lg">
              <div className="w-9 h-9 rounded-md bg-blue/15 flex items-center justify-center shrink-0">
                {payoutMethod.type === "bankTransfer" ? (
                  <Building2 className="w-4 h-4 text-blue" />
                ) : (
                  <Wallet className="w-4 h-4 text-blue" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0 truncate">
                  {payoutMethod.type === "bankTransfer" && payoutMethod.bankName
                    ? payoutMethod.bankName
                    : PAYOUT_METHOD_LABELS[payoutMethod.type]}
                  <span className="text-text-subtle"> · {payoutMethod.accountName}</span>
                </p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 font-mono">
                  {shortPayoutLabel(payoutMethod)}
                </p>
              </div>
              <span className="text-[9px] text-green bg-green/15 px-2 py-0.5 rounded-md font-medium">
                Active
              </span>
            </div>
          ) : (
            <button
              onClick={() => setPayoutOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-3 bg-canvas border border-dashed border-border-strong rounded-lg text-left hover:border-gold/40 transition"
            >
              <div className="w-9 h-9 rounded-md bg-card-elev flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">No payout method yet</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                  Add GCash, GoTyme, or a bank account
                </p>
              </div>
            </button>
          )}
        </Card>
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

        {historyLoading && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-4 h-4 text-gold animate-spin" />
          </div>
        )}

        {!historyLoading && filtered.length === 0 && (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">
            {history.length === 0
              ? "No withdrawal requests yet. Request your first one above."
              : "No withdrawals match this filter."}
          </p>
        )}

        {filtered.map((row, i) => {
          const meta = statusMeta[row.status];
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
                <p className="text-[12px] m-0">{formatPHP(row.amount)} to {row.destination}</p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5">
                  {new Date(row.createdAt).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {row.note && (
                    <span
                      className={cn(
                        "ml-2",
                        row.status === "rejected" ? "text-red" : "text-text-dim"
                      )}
                    >
                      · {row.note}
                    </span>
                  )}
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
        payoutMethod={payoutMethod}
        onSetUpPayout={() => {
          setOpen(false);
          setPayoutOpen(true);
        }}
        onSubmit={handleWithdraw}
      />

      <PayoutMethodModal
        open={payoutOpen}
        onClose={() => setPayoutOpen(false)}
        current={payoutMethod}
        onSave={handleSavePayout}
      />
    </div>
  );
}
