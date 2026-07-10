"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  Coins,
  Receipt,
  ExternalLink,
  ImageOff,
  UserPlus,
  Search,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  usePlanRequests,
  approvePlanRequest,
  rejectPlanRequest,
  adminActivatePlan,
  listAllUsers,
  type PlanRequestStatus,
  type PlanRequest,
} from "@/lib/planRequests";
import { usePlans } from "@/lib/plans";

const statusMeta = {
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  approved: { label: "Approved", icon: Check, color: "text-green", bg: "bg-green/15" },
  rejected: { label: "Rejected", icon: X, color: "text-red", bg: "bg-red/15" },
};

export default function AdminPlanRequestsPage() {
  const { user } = useAuth();
  const { rows, loading } = usePlanRequests("all");
  const [tab, setTab] = useState<PlanRequestStatus>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewReceipt, setViewReceipt] = useState<PlanRequest | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

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
      await approvePlanRequest(db, id, user.uid);
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
      await rejectPlanRequest(db, id, user.uid, note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <TopHeader
        title="Plan requests"
        subtitle={`${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected · live from Firestore`}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="grid grid-cols-3 gap-2 flex-1 min-w-[300px]">
          {(["pending", "approved", "rejected"] as PlanRequestStatus[]).map((k) => {
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
        <button
          onClick={() => setManualOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 transition shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Manual activate
        </button>
      </div>

      <Card>
        <CardHeader
          title={`${statusMeta[tab].label} requests`}
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
          return (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-3 py-3",
                i < filtered.length - 1 && "border-b border-border"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-green/15 flex items-center justify-center shrink-0">
                <Coins className="w-4 h-4 text-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">{r.userName}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">
                  {r.userEmail} · {r.planName} · {r.methodLabel}
                  {r.referenceNumber && (
                    <span className="text-vault-muted ml-1">· ref {r.referenceNumber}</span>
                  )}
                  {r.note && <span className="text-vault-muted ml-1">· {r.note}</span>}
                </p>
              </div>

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
                <p className="text-[13px] font-medium font-mono m-0 text-green">{formatPHP(r.amount)}</p>
                <p className="text-[9px] text-text-subtle m-0 mt-0.5">
                  {r.planName} · {r.durationDays}d · {r.dailyRate}%
                </p>
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
                {viewReceipt.userName} · {viewReceipt.planName} · {viewReceipt.methodLabel}
              </span>
              <span className="font-mono text-green">{formatPHP(viewReceipt.amount)}</span>
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

      {/* Manual activation modal */}
      <ManualActivateModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onError={setError}
      />
    </div>
  );
}

function ManualActivateModal({
  open,
  onClose,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const { user } = useAuth();
  const { plans } = usePlans({ onlyActive: true });
  const [users, setUsers] = useState<Array<{ uid: string; name: string; email: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUid, setSelectedUid] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    const { db } = getFirebase();
    if (!db) {
      setLoadingUsers(false);
      return;
    }
    listAllUsers(db)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  useEffect(() => {
    if (plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id);
      setAmount(plans[0].minInvestment);
    }
  }, [plans, selectedPlanId]);

  function close() {
    onClose();
    setTimeout(() => {
      setSelectedUid("");
      setSelectedPlanId("");
      setAmount(0);
      setSuccess(false);
      setSearch("");
    }, 250);
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  async function activate() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin || !selectedPlan || !selectedUid) return;
    if (amount < selectedPlan.minInvestment) {
      onError(`Minimum is ${formatPHP(selectedPlan.minInvestment)}`);
      return;
    }
    if (amount > selectedPlan.maxInvestment) {
      onError(`Maximum is ${formatPHP(selectedPlan.maxInvestment)}`);
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await adminActivatePlan(db, user.uid, {
        userId: selectedUid,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        amount,
        dailyRate: selectedPlan.dailyRate,
        durationDays: selectedPlan.durationDays,
        referralConfig: selectedPlan.referralEnabled
          ? {
              referralEnabled: selectedPlan.referralEnabled,
              referralBonusType: selectedPlan.referralBonusType,
              referralBonusValue: selectedPlan.referralBonusValue,
              referralReleaseType: selectedPlan.referralReleaseType,
              clearingPeriodDays: selectedPlan.clearingPeriodDays,
            }
          : undefined,
      });
      setSuccess(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Manual plan activation" maxWidth="max-w-md">
      {success ? (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
            <Check className="w-6 h-6 text-green" />
          </div>
          <p className="text-[14px] font-medium m-0">Plan activated</p>
          <p className="text-[11px] text-text-muted m-0">
            {selectedPlan?.name} · {formatPHP(amount)} · activated for{" "}
            {users.find((u) => u.uid === selectedUid)?.name ?? selectedUid}
          </p>
          <button
            onClick={close}
            className="mt-2 px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* User search */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Select investor
            </label>
            {loadingUsers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 text-gold animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-canvas border border-border rounded-lg mb-2">
                  <Search className="w-3 h-3 text-text-subtle" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="bg-transparent text-[12px] outline-none w-full text-text placeholder:text-text-subtle"
                  />
                </div>
                <div className="max-h-[160px] overflow-y-auto border border-border rounded-lg">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.uid}
                      onClick={() => setSelectedUid(u.uid)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition border-b border-border last:border-0",
                        selectedUid === u.uid
                          ? "bg-gold/10 text-gold"
                          : "hover:bg-card-elev text-text-muted"
                      )}
                    >
                      <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                        {(u.name?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate">{u.name}</p>
                        <p className="m-0 text-[9px] text-text-subtle truncate">{u.email}</p>
                      </div>
                      {selectedUid === u.uid && <Check className="w-3 h-3 shrink-0" />}
                    </button>
                  ))}
                  {filteredUsers.length === 0 && (
                    <p className="text-[11px] text-text-subtle text-center py-4 m-0">No investors found.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Plan picker */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Plan
            </label>
            <div className="flex flex-wrap gap-1.5">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPlanId(p.id);
                    if (amount < p.minInvestment || amount > p.maxInvestment) {
                      setAmount(p.minInvestment);
                    }
                  }}
                  className={cn(
                    "text-[11px] px-3 py-1.5 rounded-full border transition",
                    selectedPlanId === p.id
                      ? "bg-gold/10 border-border-gold text-gold font-medium"
                      : "bg-card-elev border-border text-text-muted hover:text-text"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {selectedPlan && (
              <p className="text-[9px] text-text-subtle mt-1.5 m-0">
                {selectedPlan.dailyRate}%/day · {selectedPlan.durationDays} days ·{" "}
                {formatPHP(selectedPlan.minInvestment, { short: true })} – {formatPHP(selectedPlan.maxInvestment, { short: true })}
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Amount
            </label>
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-canvas border border-border rounded-lg focus-within:border-gold/40">
              <span className="text-[16px] text-text-subtle">₱</span>
              <input
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0.00"
                className="flex-1 bg-transparent text-[18px] font-medium font-mono text-text outline-none tabular-nums"
              />
            </div>
            {selectedPlan && amount > 0 && amount < selectedPlan.minInvestment && (
              <p className="text-[10px] text-red mt-1 m-0">
                Below minimum ({formatPHP(selectedPlan.minInvestment)})
              </p>
            )}
          </div>

          <div className="flex gap-2 mt-1">
            <button
              onClick={close}
              className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
            >
              Cancel
            </button>
            <button
              onClick={activate}
              disabled={
                busy ||
                !selectedUid ||
                !selectedPlan ||
                amount < (selectedPlan?.minInvestment ?? 0) ||
                amount > (selectedPlan?.maxInvestment ?? Infinity)
              }
              className={cn(
                "flex-1 py-2.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 transition",
                selectedUid && selectedPlan && amount >= selectedPlan.minInvestment && amount <= selectedPlan.maxInvestment
                  ? "bg-gold text-gold-dark hover:brightness-110"
                  : "bg-card-elev text-text-subtle cursor-not-allowed"
              )}
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Activate plan <Check className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
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
