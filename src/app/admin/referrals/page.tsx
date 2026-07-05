"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, Unlock, Loader2, Search, Coins, Clock, Lock, Ban } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useReferralTransactions } from "@/lib/useReferrals";
import {
  approveReferralTransaction,
  cancelReferralTransaction,
  releaseReferralTransaction,
  type ReferralStatus,
} from "@/lib/referrals";
import { listInvestors } from "@/lib/adminQueries";

type Tab = "all" | ReferralStatus;

const TABS: Tab[] = ["all", "queued", "pending", "locked", "released", "cancelled"];

const STATUS_TONE: Record<ReferralStatus, string> = {
  queued: "bg-blue/15 text-blue",
  released: "bg-green/15 text-green",
  pending: "bg-gold/15 text-gold",
  locked: "bg-vault/15 text-vault",
  cancelled: "bg-red/15 text-red",
};

export default function AdminReferralsPage() {
  const { user } = useAuth();
  const { rows, loading } = useReferralTransactions("all");
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // Map referrer uid → name for readable rows.
  useEffect(() => {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    listInvestors(db, 500)
      .then((investors) => {
        const map: Record<string, string> = {};
        for (const i of investors) map[i.uid] = i.name;
        setNames(map);
      })
      .catch((e) => console.warn("listInvestors failed", e));
  }, [user]);

  const totals = useMemo(() => {
    const sum = (s: ReferralStatus) =>
      rows.filter((r) => r.status === s).reduce((a, r) => a + r.referralBonusAmount, 0);
    return {
      paid: sum("released"),
      pending: sum("pending"),
      locked: sum("locked"),
      cancelled: sum("cancelled"),
      count: rows.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!term) return true;
      const hay = [
        r.referredUserName,
        names[r.referrerUserId],
        r.referrerUserId,
        r.referredUserId,
        r.planName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, tab, search, names]);

  async function act(
    id: string,
    fn: (db: import("firebase/firestore").Firestore, id: string) => Promise<void>,
    label: string
  ) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    if (label === "cancel" && !confirm("Cancel this referral bonus and claw it back?")) return;
    setBusyId(id);
    setError(null);
    try {
      await fn(db, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <TopHeader
        title="Referrals"
        subtitle="Every referral bonus across investors — approve, release, or cancel"
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Summary icon={Coins} label="Total paid" value={formatPHP(totals.paid)} tone="green" />
        <Summary icon={Clock} label="Pending" value={formatPHP(totals.pending)} tone="gold" />
        <Summary icon={Lock} label="Locked" value={formatPHP(totals.locked)} tone="vault" />
        <Summary icon={Ban} label="Cancelled" value={formatPHP(totals.cancelled)} tone="red" />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] capitalize whitespace-nowrap transition shrink-0",
                tab === t ? "bg-gold text-gold-dark font-medium" : "bg-card-elev text-text-muted hover:text-text"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2 shrink-0">
          <Search className="w-3.5 h-3.5 text-text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user or plan…"
            className="bg-transparent outline-none text-[12px] text-text placeholder:text-text-subtle w-full sm:w-48"
          />
        </div>
      </div>

      <Card>
        <CardHeader title={`Transactions (${filtered.length})`} />
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[12px] text-text-muted text-center py-12 m-0">No referral transactions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-text-subtle border-b border-border">
                  <th className="text-left font-normal py-2 pr-3">Referrer</th>
                  <th className="text-left font-normal py-2 pr-3">Referred</th>
                  <th className="text-left font-normal py-2 pr-3">Plan</th>
                  <th className="text-right font-normal py-2 pr-3">Amount</th>
                  <th className="text-right font-normal py-2 pr-3">Bonus</th>
                  <th className="text-left font-normal py-2 pr-3">Status</th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-3 text-text truncate max-w-[130px]">
                        {names[r.referrerUserId] || r.referrerUserId.slice(0, 6)}
                      </td>
                      <td className="py-2.5 pr-3 text-text-muted truncate max-w-[130px]">
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
                            "px-2 py-0.5 rounded-full text-[10px] font-medium capitalize",
                            STATUS_TONE[r.status]
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin inline text-gold" />
                        ) : (
                          <div className="inline-flex gap-1">
                            {r.status === "pending" && (
                              <ActionBtn
                                onClick={() => act(r.id, approveReferralTransaction, "approve")}
                                tone="green"
                                icon={Check}
                                title="Approve"
                              />
                            )}
                            {r.status === "locked" && (
                              <ActionBtn
                                onClick={() => act(r.id, releaseReferralTransaction, "release")}
                                tone="vault"
                                icon={Unlock}
                                title="Release"
                              />
                            )}
                            {r.status !== "cancelled" && r.status !== "queued" && (
                              <ActionBtn
                                onClick={() => act(r.id, cancelReferralTransaction, "cancel")}
                                tone="red"
                                icon={X}
                                title="Cancel"
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  tone: "green" | "gold" | "vault" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green"
      : tone === "gold"
      ? "text-gold"
      : tone === "vault"
      ? "text-vault"
      : "text-red";
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

function ActionBtn({
  onClick,
  tone,
  icon: Icon,
  title,
}: {
  onClick: () => void;
  tone: "green" | "vault" | "red";
  icon: typeof Check;
  title: string;
}) {
  const cls =
    tone === "green"
      ? "text-green hover:bg-green/15"
      : tone === "vault"
      ? "text-vault hover:bg-vault/15"
      : "text-red hover:bg-red/15";
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("p-1.5 rounded-md border border-border-strong transition", cls)}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
