"use client";

import { useMemo, useState } from "react";
import {
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  ArrowDownToLine,
  Receipt,
  ExternalLink,
  ImageOff,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  useTopUps,
  approveTopUp,
  rejectTopUp,
  type TopUpStatus,
  type TopUpRequest,
} from "@/lib/topups";

const statusMeta = {
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  approved: { label: "Approved", icon: Check, color: "text-green", bg: "bg-green/15" },
  rejected: { label: "Rejected", icon: X, color: "text-red", bg: "bg-red/15" },
};

export default function AdminTopUpsPage() {
  const { user } = useAuth();
  const { rows, loading } = useTopUps("all");
  const [tab, setTab] = useState<TopUpStatus>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewReceipt, setViewReceipt] = useState<TopUpRequest | null>(null);

  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    }),
    [rows]
  );
  const filtered = rows.filter((r) => r.status === tab);

  async function approve(id: string) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    setBusyId(id);
    setError(null);
    try {
      await approveTopUp(db, id, user.uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    const note = prompt("Reason for rejection (optional):") ?? undefined;
    setBusyId(id);
    setError(null);
    try {
      await rejectTopUp(db, id, user.uid, note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <TopHeader
        title="Top-up requests"
        subtitle={`${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected · live from Firestore`}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3">
        {(["pending", "approved", "rejected"] as TopUpStatus[]).map((k) => {
          const meta = statusMeta[k];
          const Icon = meta.icon;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "bg-card border rounded-xl p-3 text-left transition relative overflow-hidden",
                tab === k ? "border-border-vault" : "border-border hover:border-border-strong"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-border-vault to-transparent",
                  tab === k ? "opacity-90" : "opacity-30"
                )}
              />
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn("w-7 h-7 rounded-md flex items-center justify-center", meta.bg)}>
                  <Icon className={cn("w-3.5 h-3.5", meta.color)} />
                </span>
                <span className={cn("text-[18px] font-mono font-medium", meta.color)}>{counts[k]}</span>
              </div>
              <p className="text-[11px] m-0 text-text">{meta.label}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={`${statusMeta[tab].label} top-ups`}
          right={
            tab === "pending" && counts.pending > 0 ? (
              <span className="text-[10px] text-vault flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Action needed
              </span>
            ) : undefined
          }
        />

        {loading && (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 text-vault animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">Nothing in this tab.</p>
        )}

        {filtered.map((r, i) => {
          const isBusy = busyId === r.id;
          const initials =
            (r.userName?.[0] ?? "?").toUpperCase() +
            (r.userName?.split(" ")?.[1]?.[0] ?? "").toUpperCase();
          return (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-3 py-3",
                i < filtered.length - 1 && "border-b border-border"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-green/15 flex items-center justify-center shrink-0">
                <ArrowDownToLine className="w-4 h-4 text-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">{r.userName}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">
                  {r.userEmail} · {r.methodLabel}
                  {r.referenceNumber && (
                    <span className="text-vault-muted ml-1">· ref {r.referenceNumber}</span>
                  )}
                  {r.note && <span className="text-vault-muted ml-1">· {r.note}</span>}
                </p>
              </div>

              {/* Receipt thumbnail */}
              <button
                onClick={() => r.receiptUrl && setViewReceipt(r)}
                disabled={!r.receiptUrl}
                className={cn(
                  "w-11 h-11 rounded-md overflow-hidden border flex items-center justify-center shrink-0 transition",
                  r.receiptUrl
                    ? "border-border-strong hover:border-border-gold cursor-zoom-in"
                    : "border-border cursor-not-allowed"
                )}
                aria-label={r.receiptUrl ? "View receipt" : "No receipt"}
                title={r.receiptUrl ? "Click to view receipt" : "No receipt uploaded"}
              >
                {r.receiptUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={r.receiptUrl}
                    alt="Receipt"
                    className="w-full h-full object-cover bg-white"
                  />
                ) : (
                  <ImageOff className="w-4 h-4 text-text-dim" />
                )}
              </button>

              <div className="text-right shrink-0">
                <p className="text-[13px] font-medium font-mono m-0 text-green">+{formatPHP(r.amount)}</p>
                <p className="text-[9px] text-text-subtle m-0 mt-0.5">{timeAgo(r.createdAt)}</p>
              </div>
              {tab === "pending" ? (
                <div className="flex gap-1.5 ml-auto sm:ml-0 w-full sm:w-auto">
                  <button
                    onClick={() => approve(r.id)}
                    disabled={isBusy}
                    className="flex-1 sm:flex-none text-[11px] px-3 py-1.5 bg-green/15 text-green rounded-md flex items-center justify-center gap-1.5 hover:bg-green/25 transition disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Approve
                  </button>
                  <button
                    onClick={() => reject(r.id)}
                    disabled={isBusy}
                    className="flex-1 sm:flex-none text-[11px] px-3 py-1.5 bg-card-elev border border-border-strong text-text-muted rounded-md hover:text-red hover:border-red/30 transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              ) : (
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-md font-medium",
                    statusMeta[r.status].bg,
                    statusMeta[r.status].color
                  )}
                >
                  {statusMeta[r.status].label}
                </span>
              )}
            </div>
          );
        })}
      </Card>

      {/* Receipt viewer modal */}
      <Modal
        open={viewReceipt !== null}
        onClose={() => setViewReceipt(null)}
        title="Payment receipt"
        maxWidth="max-w-2xl"
      >
        {viewReceipt && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>
                {viewReceipt.userName} · {viewReceipt.methodLabel}
              </span>
              <span className="font-mono text-green">+{formatPHP(viewReceipt.amount)}</span>
            </div>
            {viewReceipt.referenceNumber && (
              <p className="text-[11px] m-0 px-3 py-2 bg-canvas border border-border rounded-md flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-text-subtle" />
                Reference: <span className="font-mono">{viewReceipt.referenceNumber}</span>
              </p>
            )}
            <div className="bg-white rounded-lg overflow-hidden flex items-center justify-center max-h-[70vh]">
              {viewReceipt.receiptUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={viewReceipt.receiptUrl}
                  alt="Receipt"
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <div className="py-20 text-text-dim">No receipt attached</div>
              )}
            </div>
            {viewReceipt.receiptUrl && (
              <a
                href={viewReceipt.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-gold hover:underline flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" /> Open original in new tab
              </a>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
