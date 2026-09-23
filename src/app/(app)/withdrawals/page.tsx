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
  CalendarClock,
  ShieldCheck,
  Landmark,
  Smartphone,
  ArrowRight,
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
import { useSettings } from "@/lib/settings";
import {
  mergeWithdrawalSchedule,
  releaseDateFor,
  describeSchedule,
  formatReleaseDate,
  relativeReleaseLabel,
} from "@/lib/withdrawalSchedule";

type Filter = "all" | "approved" | "pending" | "rejected";

const statusMeta = {
  approved: { label: "Released", icon: CheckCircle2, color: "text-green", bg: "bg-green/15", bar: "bg-green" },
  pending: { label: "Scheduled", icon: Clock, color: "text-vault", bg: "bg-vault/15", bar: "bg-vault" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red", bg: "bg-red/15", bar: "bg-red" },
};

// Brand tint per payout channel so the saved method reads like a real card.
const methodTint: Record<PayoutMethodType, { from: string; to: string; icon: typeof Wallet; accent: string }> = {
  gcash: { from: "#0B4DA8", to: "#1E6FE8", icon: Smartphone, accent: "#7FADFF" },
  gotyme: { from: "#0E5C63", to: "#17A2B8", icon: Smartphone, accent: "#5CE0D2" },
  bankTransfer: { from: "#2A2F45", to: "#454B6B", icon: Landmark, accent: "#C9CFE3" },
};

export default function WithdrawalsPage() {
  const { state, loading: stateLoading } = useUserState();
  const { user, demoMode } = useAuth();
  const { rows: history, loading: historyLoading } = useWithdrawals("me");
  const [open, setOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const { settings } = useSettings();
  const schedule = mergeWithdrawalSchedule(settings.withdrawalSchedule);
  const nextRelease = releaseDateFor(Date.now(), schedule);

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
      scheduledReleaseAt: releaseDateFor(Date.now(), schedule),
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

  const wallet = state.balances.wallet;
  const filtered = filter === "all" ? history : history.filter((h) => h.status === filter);
  const totalApproved = history.filter((h) => h.status === "approved").reduce((s, h) => s + h.amount, 0);
  const totalPending = history.filter((h) => h.status === "pending").reduce((s, h) => s + h.amount, 0);
  const pendingCount = history.filter((h) => h.status === "pending").length;
  const tint = payoutMethod ? methodTint[payoutMethod.type] : null;
  const MethodIcon = tint?.icon ?? Wallet;

  return (
    <div>
      <TopHeader title="Withdrawals" subtitle="Request and track payouts from your wallet" />

      {/* No payout method yet — the one thing blocking a withdrawal, so say it loudly. */}
      {!payoutMethod && (
        <div className="relative overflow-hidden rounded-2xl border border-gold/40 mb-3 p-4 sm:p-5 bg-gradient-to-r from-gold/15 via-card to-card">
          <span aria-hidden className="pointer-events-none absolute -left-10 -top-10 w-40 h-40 rounded-full bg-gold/20 blur-2xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-gold/20 ring-1 ring-gold/40 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-gold" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-text m-0">Set up your mode of payout to withdraw</p>
              <p className="text-[11px] text-text-muted m-0 mt-1">
                Tell us where to send your money — GCash, GoTyme or a bank account. It takes a minute, and you only do it once.
              </p>
            </div>
            <button
              onClick={() => setPayoutOpen(true)}
              className="shrink-0 px-4 py-2.5 bg-gold text-gold-dark rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:brightness-110 transition"
            >
              Set up now <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3 mb-3 items-stretch">
        {/* Balance hero */}
        <Card gold className="flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] text-text-subtle uppercase tracking-[0.14em] m-0 mb-2">Available to withdraw</p>
              <p className="text-[34px] sm:text-[40px] font-mono font-medium m-0 leading-none tabular-nums text-text">
                {formatPHP(wallet)}
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-5 h-5 text-gold" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-canvas/60 border border-border rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-text-subtle uppercase tracking-wide m-0">In escrow · {pendingCount} pending</p>
              <p className="text-[15px] font-mono text-vault m-0 mt-0.5 tabular-nums">{formatPHP(totalPending)}</p>
            </div>
            <div className="bg-canvas/60 border border-border rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-text-subtle uppercase tracking-wide m-0">All-time released</p>
              <p className="text-[15px] font-mono text-text m-0 mt-0.5 tabular-nums">{formatPHP(totalApproved)}</p>
            </div>
          </div>

          {payoutMethod ? (
            <button
              onClick={openWithdraw}
              disabled={wallet <= 0}
              className="mt-4 w-full px-5 py-3 bg-gold text-gold-dark rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpRight className="w-4 h-4" />
              Request withdrawal
            </button>
          ) : (
            <button
              onClick={() => setPayoutOpen(true)}
              className="mt-4 w-full px-5 py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 border border-gold/50 text-gold bg-gold/10 hover:bg-gold/15 transition"
            >
              <Plus className="w-4 h-4" />
              Set up mode of payout first
            </button>
          )}

          {/* Release schedule — so members know when a request made now is paid out */}
          <div className="mt-3 flex gap-2.5 px-3 py-2.5 bg-canvas/60 border border-border rounded-xl">
            <CalendarClock className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] m-0 text-text">
                {nextRelease ? (
                  <>
                    Request now → released <span className="font-medium text-gold">{formatReleaseDate(nextRelease)}</span>{" "}
                    <span className="text-text-subtle">({relativeReleaseLabel(nextRelease)})</span>
                  </>
                ) : (
                  "Released once approved."
                )}
              </p>
              <p className="text-[10px] text-text-subtle mt-0.5 m-0">{describeSchedule(schedule)}</p>
              {schedule.note && <p className="text-[10px] text-text-subtle mt-0.5 m-0">{schedule.note}</p>}
            </div>
          </div>
        </Card>

        {/* Mode of payout */}
        <Card className={cn("flex flex-col", !payoutMethod && "border-gold/40")}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] text-text-subtle uppercase tracking-[0.14em] m-0 mb-1">Mode of payout</p>
              <p className="text-[11px] text-text-muted m-0">Where released withdrawals are sent</p>
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

          {payoutMethod && tint ? (
            <div
              className="relative overflow-hidden rounded-2xl p-4 text-white flex-1 min-h-[132px] flex flex-col justify-between"
              style={{ background: `linear-gradient(135deg, ${tint.from}, ${tint.to})` }}
            >
              <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                    <MethodIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium m-0 truncate">
                      {payoutMethod.type === "bankTransfer" && payoutMethod.bankName ? payoutMethod.bankName : PAYOUT_METHOD_LABELS[payoutMethod.type]}
                    </p>
                    <p className="text-[10px] text-white/70 m-0">{PAYOUT_METHOD_LABELS[payoutMethod.type]}</p>
                  </div>
                </div>
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-white/15 flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Active
                </span>
              </div>
              <div className="relative mt-4">
                <p className="text-[16px] font-mono tracking-[0.12em] m-0">{shortPayoutLabel(payoutMethod)}</p>
                <p className="text-[10px] text-white/75 m-0 mt-1 uppercase tracking-wide truncate">{payoutMethod.accountName}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPayoutOpen(true)}
              className="group flex-1 min-h-[132px] w-full flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-2xl border-2 border-dashed border-gold/50 bg-gold/[0.06] text-center hover:bg-gold/10 hover:border-gold transition"
            >
              <span className="relative w-11 h-11 rounded-full bg-gold/15 flex items-center justify-center">
                <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-gold/40 animate-ping" />
                <Plus className="w-5 h-5 text-gold relative" />
              </span>
              <span className="text-[13px] font-medium text-text">No mode of payout yet</span>
              <span className="text-[10px] text-text-muted">Required before you can withdraw · GCash, GoTyme or bank</span>
              <span className="text-[11px] font-semibold text-gold mt-1 flex items-center gap-1">
                Add one now <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          )}

          <p className="text-[10px] text-text-subtle m-0 mt-3 flex items-center gap-1.5">
            <Building2 className="w-3 h-3" /> Payouts are sent only to the account saved here.
          </p>
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
                    filter === f ? "bg-gold/15 text-gold font-medium" : "text-text-subtle hover:text-text"
                  )}
                >
                  {f === "approved" ? "Released" : f}
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
          <div className="py-10 flex flex-col items-center text-center gap-2">
            <span className="w-11 h-11 rounded-full bg-card-elev flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-text-subtle" />
            </span>
            <p className="text-[12px] text-text m-0">{history.length === 0 ? "No withdrawals yet" : "Nothing matches this filter"}</p>
            <p className="text-[10px] text-text-subtle m-0 max-w-[280px]">
              {history.length === 0
                ? payoutMethod
                  ? "Your requests and their release dates will show here."
                  : "Add a mode of payout, then request your first withdrawal."
                : ""}
            </p>
          </div>
        )}

        {filtered.map((row, i) => {
          const meta = statusMeta[row.status];
          const Icon = meta.icon;
          // Older requests (before the schedule existed) get a date from the current schedule.
          const releaseAt = row.status === "pending" ? (row.scheduledReleaseAt ?? releaseDateFor(row.createdAt, schedule)) : null;
          return (
            <div key={row.id} className={cn("flex items-center gap-3 py-3", i < filtered.length - 1 && "border-b border-border")}>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
                <Icon className={cn("w-4 h-4", meta.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0 truncate">
                  <span className="font-mono font-medium text-text">{formatPHP(row.amount)}</span>
                  <span className="text-text-subtle"> to {row.destination}</span>
                </p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>
                    Requested{" "}
                    {new Date(row.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {releaseAt != null && (
                    <span className="flex items-center gap-1 text-gold">
                      <CalendarClock className="w-3 h-3" /> Releases {formatReleaseDate(releaseAt)} · {relativeReleaseLabel(releaseAt)}
                    </span>
                  )}
                  {row.status === "approved" && row.processedAt && (
                    <span className="text-green">Released {formatReleaseDate(row.processedAt)}</span>
                  )}
                  {row.note && <span className={row.status === "rejected" ? "text-red" : "text-text-dim"}>· {row.note}</span>}
                </p>
              </div>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-medium shrink-0", meta.bg, meta.color)}>{meta.label}</span>
            </div>
          );
        })}
      </Card>

      <WithdrawModal
        open={open}
        onClose={() => setOpen(false)}
        availableBalance={wallet}
        payoutMethod={payoutMethod}
        schedule={schedule}
        onSetUpPayout={() => {
          setOpen(false);
          setPayoutOpen(true);
        }}
        onSubmit={handleWithdraw}
      />

      <PayoutMethodModal open={payoutOpen} onClose={() => setPayoutOpen(false)} current={payoutMethod} onSave={handleSavePayout} />
    </div>
  );
}
