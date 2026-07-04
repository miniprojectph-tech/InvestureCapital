"use client";

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { Loader2, Lock, LockOpen, CheckCircle2, AlertCircle, Search, Zap } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listActiveVaults, type VaultRow } from "@/lib/adminQueries";
import { computeVaultLockDay } from "@/lib/userState";
import { useSettings } from "@/lib/settings";

type Tab = "locked" | "unlocked";

export default function AdminActiveVaultsPage() {
  const { user, demoMode } = useAuth();
  const { settings } = useSettings();
  const ratePct = settings.vaultDailyRate;
  const rate = ratePct / 100;
  const lockDays = settings.vaultLockDays;

  const [tab, setTab] = useState<Tab>("locked");
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [runningMaintenance, setRunningMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const { db } = getFirebase();
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        const list = await listActiveVaults(db);
        if (!cancelled) {
          setRows(list);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load — check Firestore rules");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, demoMode, refreshKey]);

  async function runMaintenanceNow() {
    const { functions } = getFirebase();
    if (!functions || !user?.isAdmin) {
      setError("Admin role required.");
      return;
    }
    setRunningMaintenance(true);
    setMaintenanceMsg(null);
    setError(null);
    try {
      const call = httpsCallable<void, { usersScanned: number; usersUpdated: number; plansCompleted: number }>(
        functions,
        "runMaintenanceNow"
      );
      const res = await call();
      setMaintenanceMsg(
        `Scanned ${res.data.usersScanned} investors · compounded/updated ${res.data.usersUpdated} · completed ${res.data.plansCompleted} plan(s)`
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Maintenance run failed");
    } finally {
      setRunningMaintenance(false);
    }
  }

  const withLock = useMemo(
    () =>
      rows.map((r) => {
        const lockDay = computeVaultLockDay(r.vaultLockStartedAt);
        return { ...r, lockDay, unlocked: lockDay >= lockDays };
      }),
    [rows, lockDays]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return withLock.filter(
      (r) =>
        (tab === "unlocked" ? r.unlocked : !r.unlocked) &&
        (!q || r.userName.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q))
    );
  }, [withLock, tab, query]);

  const lockedCount = withLock.filter((r) => !r.unlocked).length;
  const unlockedCount = withLock.filter((r) => r.unlocked).length;
  const totalVault = rows.reduce((s, r) => s + r.vault, 0);

  return (
    <div>
      <TopHeader
        title="Active vaults"
        subtitle={`${rows.length} vaults · ${formatPHP(totalVault, { short: true })} locked · compounding ${ratePct}%/day`}
      />

      {maintenanceMsg && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-vault/10 border border-border-vault rounded-lg text-[11px] text-vault">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{maintenanceMsg}</span>
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={runMaintenanceNow}
          disabled={runningMaintenance}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-vault/15 border border-border-vault text-vault rounded-full text-[12px] hover:bg-vault/25 transition disabled:opacity-60"
          title="Runs the scheduled job that compounds every vault (and completes due plans) — apply it now instead of waiting for the hourly run"
        >
          {runningMaintenance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Run maintenance now
        </button>
        <button
          onClick={() => setTab("locked")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[12px] transition",
            tab === "locked" ? "bg-vault/15 border-border-vault text-vault font-medium" : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          <Lock className="w-3.5 h-3.5" /> Locked
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-mono", tab === "locked" ? "bg-vault/20" : "bg-card-elev")}>
            {lockedCount}
          </span>
        </button>
        <button
          onClick={() => setTab("unlocked")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[12px] transition",
            tab === "unlocked" ? "bg-green/15 border-green/30 text-green font-medium" : "bg-card border-border text-text-muted hover:text-text"
          )}
        >
          <LockOpen className="w-3.5 h-3.5" /> Unlocked
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-mono", tab === "unlocked" ? "bg-green/20" : "bg-card-elev")}>
            {unlockedCount}
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full">
          <Search className="w-3 h-3 text-text-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investor…"
            className="bg-transparent text-[11px] outline-none w-44 text-text placeholder:text-text-subtle"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-5 h-5 text-vault animate-spin" />
        </div>
      ) : (
        <Card>
          <CardHeader
            title={tab === "locked" ? `Locked vaults (${filtered.length})` : `Unlocked vaults (${filtered.length})`}
            subtitle={
              tab === "locked"
                ? `Compounding daily · unlock after ${lockDays} days`
                : "Past the lock period — withdrawable"
            }
          />
          {filtered.length === 0 ? (
            <p className="text-[11px] text-text-subtle text-center py-8 m-0">
              {tab === "locked" ? "No locked vaults right now." : "No unlocked vaults yet."}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[11px] table-fixed min-w-[720px]">
                <colgroup>
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr className="text-text-subtle text-left">
                    <th className="font-normal py-2">Investor</th>
                    <th className="font-normal py-2 text-right">Vault now</th>
                    <th className="font-normal py-2 text-right">Daily accrual</th>
                    <th className="font-normal py-2">Lock progress</th>
                    <th className="font-normal py-2 text-right">Projected (unlock)</th>
                    <th className="font-normal py-2">Last compounded</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const remaining = Math.max(0, lockDays - r.lockDay);
                    const projected = r.vault * Math.pow(1 + rate, remaining);
                    const pct = Math.min(100, Math.round((r.lockDay / Math.max(1, lockDays)) * 100));
                    return (
                      <tr key={r.userId} className="border-t border-border">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                              {(r.userName?.[0] ?? "?").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="m-0 text-[11px] truncate">{r.userName}</p>
                              <p className="m-0 text-[9px] text-text-subtle truncate">{r.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono text-vault">{formatPHP(r.vault, { short: true })}</td>
                        <td className="py-2 text-right font-mono text-green">+{formatPHP(r.vault * rate)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-card-elev overflow-hidden">
                              <div className="h-full bg-vault rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[9px] text-text-subtle font-mono whitespace-nowrap">
                              {r.lockDay}/{lockDays}d
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono text-vault-muted">{formatPHP(projected, { short: true })}</td>
                        <td className="py-2 text-text-muted text-[10px]">
                          {r.vaultLastCompoundedAt
                            ? new Date(r.vaultLastCompoundedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
