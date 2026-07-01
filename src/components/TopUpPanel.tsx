"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { TopUpModal } from "./TopUpModal";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { requestTopUp, useTopUps, type TopUpStatus } from "@/lib/topups";
import { useSettings, PAYMENT_METHOD_LABELS, type PaymentMethodId } from "@/lib/settings";
import { uploadReceipt } from "@/lib/storage";
import { formatPHP, cn } from "@/lib/utils";

const statusMeta: Record<
  TopUpStatus,
  { label: string; color: string; bg: string; icon: typeof Clock }
> = {
  pending: { label: "Pending", color: "text-vault", bg: "bg-vault/15", icon: Clock },
  approved: { label: "Approved", color: "text-green", bg: "bg-green/15", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red", bg: "bg-red/15", icon: XCircle },
};

export function TopUpPanel() {
  const { user, demoMode } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { rows, loading: rowsLoading } = useTopUps("me");
  const [open, setOpen] = useState(false);

  async function handleSubmit(args: {
    amount: number;
    method: PaymentMethodId;
    referenceNumber?: string;
    receiptFile?: File;
  }) {
    if (demoMode || !user) return;
    const { db, storage } = getFirebase();
    if (!db) return;

    // Upload receipt first (if any) so we have the URL to attach to the request
    let receiptUrl: string | undefined;
    let receiptPath: string | undefined;
    if (args.receiptFile && storage) {
      const uploaded = await uploadReceipt(storage, user.uid, args.receiptFile);
      receiptUrl = uploaded.url;
      receiptPath = uploaded.path;
    }

    await requestTopUp(db, {
      userId: user.uid,
      userName: user.name,
      userEmail: user.email,
      amount: args.amount,
      method: args.method,
      referenceNumber: args.referenceNumber,
      receiptUrl,
      receiptPath,
    });
  }

  const recent = rows.slice(0, 3);
  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const pendingTotal = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + r.amount, 0);

  const methods = settings.paymentMethods;
  const anyEnabled = methods
    ? (["gotyme", "gcash", "bankTransfer"] as PaymentMethodId[]).some((m) => methods[m]?.enabled)
    : false;

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">
          Top up wallet
        </p>
        {pendingCount > 0 && (
          <span className="text-[10px] font-medium bg-vault/15 text-vault px-2 py-0.5 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      <p className="text-[11px] text-text-muted m-0 mb-4 leading-relaxed">
        Send money via your chosen payment method, then submit a request — admin credits your
        wallet once your payment is verified.
      </p>

      {settingsLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 text-gold animate-spin" />
        </div>
      ) : !anyEnabled ? (
        <div className="px-3 py-2.5 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red flex items-start gap-2 mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Admin hasn&apos;t configured any payment methods yet. Top-ups will be available once they
            enable GoTyme, GCash, or Bank transfer in Settings.
          </span>
        </div>
      ) : null}

      <button
        onClick={() => setOpen(true)}
        disabled={!anyEnabled}
        className={cn(
          "w-full py-3 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition",
          anyEnabled
            ? "bg-gold text-gold-dark hover:brightness-110"
            : "bg-card-elev text-text-subtle cursor-not-allowed"
        )}
      >
        <ArrowDownToLine className="w-4 h-4" />
        Request top up
      </button>

      {/* Recent requests */}
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0 mb-2">
          Recent requests
          {pendingTotal > 0 && (
            <span className="text-vault-muted ml-2 normal-case font-normal">
              · {formatPHP(pendingTotal, { short: true })} awaiting approval
            </span>
          )}
        </p>
        {rowsLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="w-3.5 h-3.5 text-gold animate-spin" />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-[10px] text-text-subtle m-0 text-center py-3">
            No top-up requests yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recent.map((r) => {
              const meta = statusMeta[r.status];
              const Icon = meta.icon;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 bg-canvas border border-border rounded-md"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                        meta.bg
                      )}
                    >
                      <Icon className={cn("w-2.5 h-2.5", meta.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] m-0 font-mono">{formatPHP(r.amount)}</p>
                      <p className="text-[9px] text-text-subtle m-0">
                        {PAYMENT_METHOD_LABELS[r.method]} · {new Date(r.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md", meta.bg, meta.color)}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TopUpModal open={open} onClose={() => setOpen(false)} onSubmit={handleSubmit} />
    </div>
  );
}
