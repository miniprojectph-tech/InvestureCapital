"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download, Save, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import {
  useGameConfig,
  useGamesSettings,
  effectiveDailyCredits,
  adminListGameStates,
  adminSaveGameState,
  adminResetGameState,
  type AdminGameRow,
} from "@/lib/game";

type ChipKey = "vault" | "wallet" | "plans" | "joined" | "games";
type EditFields = { energy: string; streak: string; weeklyScore: string };

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateShort(ms: number) {
  return new Date(ms).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function daysAgo(ms: number) {
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}

function lockDay(lockStartedAt: number | null) {
  if (!lockStartedAt) return 0;
  return Math.max(0, Math.min(365, Math.floor((Date.now() - lockStartedAt) / 86_400_000)));
}

function exportCsvFile(
  rows: Record<string, string | number>[],
  headers: string[],
  filename: string,
) {
  const esc = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h] ?? "")).join(",")),
  ].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TAB_LABELS: Record<ChipKey, string> = {
  vault: "Vault",
  wallet: "Wallet",
  plans: "Plans",
  joined: "Joined",
  games: "Games",
};

export default function AdminInvestorsPage() {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<InvestorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ChipKey>("joined");

  const { config } = useGameConfig();
  const { settings: gamesSettings } = useGamesSettings();
  const dailyCredits = effectiveDailyCredits(config.dailyEnergy, gamesSettings.universalDailyCredits);
  const [gameRows, setGameRows] = useState<AdminGameRow[] | null>(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<EditFields>>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [gameMsg, setGameMsg] = useState<string | null>(null);
  const [gameErr, setGameErr] = useState<string | null>(null);

  useEffect(() => {
    if (sortKey !== "games" || gameRows !== null || demoMode) return;
    const { db } = getFirebase();
    if (!db) { setGameRows([]); return; }
    setGameLoading(true);
    adminListGameStates(db)
      .then((r) => setGameRows(r))
      .catch((e) => {
        setGameErr(e instanceof Error ? e.message : "Failed to load game states");
        setGameRows([]);
      })
      .finally(() => setGameLoading(false));
  }, [sortKey, gameRows, demoMode]);

  const gameByUid = useMemo(
    () => new Map((gameRows ?? []).map((g) => [g.uid, g])),
    [gameRows]
  );

  function upsertGameRow(row: AdminGameRow) {
    setGameRows((prev) => {
      const list = prev ?? [];
      const i = list.findIndex((g) => g.uid === row.uid);
      if (i === -1) return [...list, row];
      const next = [...list];
      next[i] = row;
      return next;
    });
  }

  function setEdit(uid: string, field: keyof EditFields, value: string) {
    setEdits((e) => ({ ...e, [uid]: { ...e[uid], [field]: value } }));
  }

  async function saveGame(row: {
    uid: string;
    name: string;
    energy: number;
    streak: number;
    weeklyScore: number;
    points: number;
    totalCasts: number;
    collectionCount: number;
  }) {
    const { db } = getFirebase();
    if (!db) return;
    const e = edits[row.uid] ?? {};
    const num = (v: string | undefined, fallback: number) => {
      const n = Number(v);
      return v === undefined || v === "" || Number.isNaN(n) ? fallback : Math.max(0, Math.round(n));
    };
    const energy = num(e.energy, row.energy);
    const streak = num(e.streak, row.streak);
    const weeklyScore = num(e.weeklyScore, row.weeklyScore);
    setBusyUid(row.uid);
    setGameErr(null);
    setGameMsg(null);
    try {
      await adminSaveGameState(db, row.uid, { energy, streak, weeklyScore });
      upsertGameRow({ uid: row.uid, points: row.points, energy, streak, weeklyScore, totalCasts: row.totalCasts, collectionCount: row.collectionCount });
      setEdits((x) => { const n = { ...x }; delete n[row.uid]; return n; });
      setGameMsg(`Saved ${row.name}.`);
    } catch (err) {
      setGameErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyUid(null);
    }
  }

  async function resetGame(uid: string, name: string) {
    if (!confirm(`Reset ${name}'s game progress? This clears points, collection, streak and weekly score, and sets credits to ${dailyCredits}.`))
      return;
    const { db } = getFirebase();
    if (!db) return;
    setBusyUid(uid);
    setGameErr(null);
    setGameMsg(null);
    try {
      await adminResetGameState(db, uid, dailyCredits);
      upsertGameRow({ uid, points: 0, energy: dailyCredits, streak: 0, weeklyScore: 0, totalCasts: 0, collectionCount: 0 });
      setEdits((x) => { const n = { ...x }; delete n[uid]; return n; });
      setGameMsg(`Reset ${name}.`);
    } catch (err) {
      setGameErr(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusyUid(null);
    }
  }

  const gameTable = useMemo(() => {
    const q = query.toLowerCase();
    return rows
      .filter((r) => !q || r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .map((r) => {
        const g = gameByUid.get(r.uid);
        return {
          uid: r.uid, name: r.name, email: r.email,
          points: g?.points ?? 0, energy: g?.energy ?? 0,
          streak: g?.streak ?? 0, weeklyScore: g?.weeklyScore ?? 0,
          totalCasts: g?.totalCasts ?? 0, collectionCount: g?.collectionCount ?? 0,
          hasState: !!g,
        };
      })
      .sort((a, b) => b.points - a.points || b.totalCasts - a.totalCasts);
  }, [rows, gameByUid, query]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) { if (!cancelled) { setRows([]); setLoading(false); } return; }
      const { db } = getFirebase();
      if (!db) { setLoading(false); return; }
      try {
        const list = await listInvestors(db, 500);
        if (!cancelled) { setRows(list); setLoading(false); }
      } catch {
        if (!cancelled) { setRows([]); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, demoMode]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const matched = rows.filter(
      (r) => !q || r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)
    );
    return [...matched].sort((a, b) => {
      switch (sortKey) {
        case "vault": return b.vault - a.vault;
        case "wallet": return b.wallet - a.wallet;
        case "plans": return b.activePlansCount - a.activePlansCount;
        case "joined": default: return b.joinedAt - a.joinedAt;
      }
    });
  }, [rows, query, sortKey]);

  function exportCsv() {
    const date = new Date().toISOString().slice(0, 10);
    if (sortKey === "games") {
      exportCsvFile(
        gameTable.map((r) => ({
          Name: r.name, Email: r.email, Points: r.points, Credits: r.energy,
          Streak: r.streak, Weekly: r.weeklyScore, Casts: r.totalCasts, Fish: r.collectionCount,
        })),
        ["Name", "Email", "Points", "Credits", "Streak", "Weekly", "Casts", "Fish"],
        `investors-games-${date}`,
      );
    } else if (sortKey === "vault") {
      exportCsvFile(
        filtered.map((u) => ({
          Name: u.name, Email: u.email, "Vault Balance": u.vault,
          "Lock Started": u.vaultLockStartedAt ? fmtDate(u.vaultLockStartedAt) : "—",
          "Last Compounded": u.vaultLastCompoundedAt ? fmtDate(u.vaultLastCompoundedAt) : "—",
          "Lock Day": lockDay(u.vaultLockStartedAt),
          Role: u.isAdmin ? "Admin" : "Investor",
        })),
        ["Name", "Email", "Vault Balance", "Lock Started", "Last Compounded", "Lock Day", "Role"],
        `investors-vault-${date}`,
      );
    } else if (sortKey === "wallet") {
      exportCsvFile(
        filtered.map((u) => ({
          Name: u.name, Email: u.email, Wallet: u.wallet, Deployed: u.deployed,
          "Total Portfolio": u.wallet + u.deployed + u.vault,
          "Active Plans": u.activePlansCount,
          Role: u.isAdmin ? "Admin" : "Investor",
        })),
        ["Name", "Email", "Wallet", "Deployed", "Total Portfolio", "Active Plans", "Role"],
        `investors-wallet-${date}`,
      );
    } else if (sortKey === "plans") {
      exportCsvFile(
        filtered.map((u) => ({
          Name: u.name, Email: u.email, "Active Plans": u.activePlansCount,
          "Deployed Capital": u.deployed, "Completed Plans": u.completedPlansCount,
          "Total Earned": u.totalEarned,
          Role: u.isAdmin ? "Admin" : "Investor",
        })),
        ["Name", "Email", "Active Plans", "Deployed Capital", "Completed Plans", "Total Earned", "Role"],
        `investors-plans-${date}`,
      );
    } else {
      exportCsvFile(
        filtered.map((u) => ({
          Name: u.name, Email: u.email, Joined: fmtDate(u.joinedAt),
          "Active Plans": u.activePlansCount, Wallet: u.wallet, Vault: u.vault,
          Role: u.isAdmin ? "Admin" : "Investor",
        })),
        ["Name", "Email", "Joined", "Active Plans", "Wallet", "Vault", "Role"],
        `investors-${date}`,
      );
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  const subtitle: Record<ChipKey, string> = {
    vault: `${rows.length} accounts · vault balances & lock status`,
    wallet: `${rows.length} accounts · wallet & deployed capital`,
    plans: `${rows.length} accounts · plan activity & earnings`,
    joined: `${rows.length} accounts · newest first`,
    games: `${rows.length} accounts · game credits & points`,
  };

  return (
    <div>
      <TopHeader title="Investors" subtitle={subtitle[sortKey]} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full flex-1 sm:flex-none sm:min-w-[260px]">
          <Search className="w-3 h-3 text-text-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="bg-transparent text-[11px] outline-none flex-1 text-text placeholder:text-text-subtle"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["joined", "vault", "wallet", "plans", "games"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={cn(
                "text-[10px] px-2.5 py-1.5 rounded-full transition",
                sortKey === k
                  ? k === "games"
                    ? "bg-gold/15 text-gold font-medium"
                    : "bg-vault/15 text-vault font-medium"
                  : "text-text-subtle hover:text-text"
              )}
            >
              {TAB_LABELS[k]}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          className="ml-auto text-[11px] px-3 py-1.5 bg-card border border-border rounded-full text-text-muted hover:text-text flex items-center gap-1.5"
        >
          <Download className="w-3 h-3" /> Export CSV
        </button>
      </div>

      {/* ── Games tab ── */}
      {sortKey === "games" && (
        <>
          {(gameMsg || gameErr) && (
            <div className={cn(
              "mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]",
              gameErr ? "bg-red/10 border border-red/30 text-red" : "bg-green/10 border border-green/30 text-green"
            )}>
              {gameErr ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {gameErr ?? gameMsg}
            </div>
          )}
          <Card>
            <CardHeader
              title={`Game accounts (${gameTable.length})`}
              subtitle={`Monitor & adjust credits/streak/weekly · universal default ${dailyCredits}`}
            />
            {demoMode ? (
              <p className="text-[11px] text-text-subtle text-center py-8 m-0">Sign in as admin to view live game data.</p>
            ) : gameLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] min-w-[860px]">
                  <thead>
                    <tr className="text-text-subtle text-left">
                      <th className="font-normal py-2 px-1">Name</th>
                      <th className="font-normal py-2 px-1">Email</th>
                      <th className="font-normal py-2 px-1 text-right">Points</th>
                      <th className="font-normal py-2 px-1 text-center">Credits</th>
                      <th className="font-normal py-2 px-1 text-center">Streak</th>
                      <th className="font-normal py-2 px-1 text-center">Weekly</th>
                      <th className="font-normal py-2 px-1 text-right">Casts</th>
                      <th className="font-normal py-2 px-1 text-right">Fish</th>
                      <th className="font-normal py-2 px-1 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameTable.map((r) => {
                      const e = edits[r.uid] ?? {};
                      const dirty = e.energy !== undefined || e.streak !== undefined || e.weeklyScore !== undefined;
                      const busy = busyUid === r.uid;
                      return (
                        <tr key={r.uid} className="border-t border-border hover:bg-card-elev/40 transition">
                          <td className="py-2 px-1">
                            <p className="m-0 text-[11px] truncate font-medium">{r.name}</p>
                            {!r.hasState && <p className="m-0 text-[9px] text-text-subtle">never played</p>}
                          </td>
                          <td className="py-2 px-1">
                            <p className="m-0 text-[10px] text-text-muted truncate">{r.email}</p>
                          </td>
                          <td className="py-2 px-1 text-right font-mono text-vault">{r.points.toLocaleString()}</td>
                          <td className="py-2 px-1 text-center">
                            <input type="number" value={e.energy ?? String(r.energy)} onChange={(ev) => setEdit(r.uid, "energy", ev.target.value)}
                              className="w-14 px-1.5 py-1 bg-canvas border border-border rounded text-[11px] font-mono text-center outline-none focus:border-gold/40" />
                          </td>
                          <td className="py-2 px-1 text-center">
                            <input type="number" value={e.streak ?? String(r.streak)} onChange={(ev) => setEdit(r.uid, "streak", ev.target.value)}
                              className="w-12 px-1.5 py-1 bg-canvas border border-border rounded text-[11px] font-mono text-center outline-none focus:border-gold/40" />
                          </td>
                          <td className="py-2 px-1 text-center">
                            <input type="number" value={e.weeklyScore ?? String(r.weeklyScore)} onChange={(ev) => setEdit(r.uid, "weeklyScore", ev.target.value)}
                              className="w-16 px-1.5 py-1 bg-canvas border border-border rounded text-[11px] font-mono text-center outline-none focus:border-gold/40" />
                          </td>
                          <td className="py-2 px-1 text-right font-mono">{r.totalCasts}</td>
                          <td className="py-2 px-1 text-right font-mono">{r.collectionCount}</td>
                          <td className="py-2 px-1 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => saveGame(r)} disabled={busy || !dirty}
                                className="text-[10px] px-2 py-1 rounded-md bg-gold/15 text-gold disabled:opacity-40 flex items-center gap-1">
                                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                              </button>
                              <button onClick={() => resetGame(r.uid, r.name)} disabled={busy}
                                className="text-[10px] px-2 py-1 rounded-md border border-border text-text-subtle hover:text-red disabled:opacity-40 flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" /> Reset
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {gameTable.length === 0 && (
                      <tr><td colSpan={9} className="text-center text-text-subtle py-8">No investors match your search.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Vault tab ── */}
      {sortKey === "vault" && (
        <Card>
          <CardHeader title={`Vault overview (${filtered.length})`} subtitle="Vault balances, lock status, and compounding" />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] table-fixed min-w-[820px]">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="text-text-subtle text-left">
                  <th className="font-normal py-2 px-1">Name</th>
                  <th className="font-normal py-2 px-1">Email</th>
                  <th className="font-normal py-2 px-1 text-right">Vault Balance</th>
                  <th className="font-normal py-2 px-1">Lock Started</th>
                  <th className="font-normal py-2 px-1">Last Compounded</th>
                  <th className="font-normal py-2 px-1">Lock Progress</th>
                  <th className="font-normal py-2 px-1 text-right">Role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const ld = lockDay(u.vaultLockStartedAt);
                  const pct = u.vaultLockStartedAt ? Math.min(100, (ld / 365) * 100) : 0;
                  return (
                    <tr key={u.uid} className="border-t border-border hover:bg-card-elev/50 transition">
                      <td className="py-2 px-1"><p className="m-0 text-[11px] truncate font-medium">{u.name}</p></td>
                      <td className="py-2 px-1"><p className="m-0 text-[10px] text-text-muted truncate">{u.email}</p></td>
                      <td className="py-2 px-1 text-right font-mono text-vault">{formatPHP(u.vault, { short: true })}</td>
                      <td className="py-2 px-1 text-text-muted text-[10px]">
                        {u.vaultLockStartedAt ? fmtDateShort(u.vaultLockStartedAt) : "—"}
                      </td>
                      <td className="py-2 px-1 text-text-muted text-[10px]">
                        {u.vaultLastCompoundedAt ? daysAgo(u.vaultLastCompoundedAt) : "—"}
                      </td>
                      <td className="py-2 px-1">
                        {u.vaultLockStartedAt ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="text-text-muted">Day {ld}/365</span>
                              <span className="text-text-subtle">{pct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                              <div className="h-full bg-vault rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[9px] text-text-subtle">No lock</span>
                        )}
                      </td>
                      <td className="py-2 px-1 text-right">
                        {u.isAdmin ? (
                          <span className="text-[9px] bg-vault/15 text-vault px-1.5 py-0.5 rounded-md">Admin</span>
                        ) : (
                          <span className="text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md">Investor</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-text-subtle py-8">No investors match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Wallet tab ── */}
      {sortKey === "wallet" && (
        <Card>
          <CardHeader title={`Wallet overview (${filtered.length})`} subtitle="Wallet balances, deployed capital, and total portfolio" />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] table-fixed min-w-[780px]">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="text-text-subtle text-left">
                  <th className="font-normal py-2 px-1">Name</th>
                  <th className="font-normal py-2 px-1">Email</th>
                  <th className="font-normal py-2 px-1 text-right">Wallet</th>
                  <th className="font-normal py-2 px-1 text-right">Deployed</th>
                  <th className="font-normal py-2 px-1 text-right">Total Portfolio</th>
                  <th className="font-normal py-2 px-1 text-right">Active Plans</th>
                  <th className="font-normal py-2 px-1 text-right">Role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const total = u.wallet + u.deployed + u.vault;
                  return (
                    <tr key={u.uid} className="border-t border-border hover:bg-card-elev/50 transition">
                      <td className="py-2 px-1"><p className="m-0 text-[11px] truncate font-medium">{u.name}</p></td>
                      <td className="py-2 px-1"><p className="m-0 text-[10px] text-text-muted truncate">{u.email}</p></td>
                      <td className="py-2 px-1 text-right font-mono">{formatPHP(u.wallet, { short: true })}</td>
                      <td className="py-2 px-1 text-right font-mono text-green">{formatPHP(u.deployed, { short: true })}</td>
                      <td className="py-2 px-1 text-right font-mono font-medium">{formatPHP(total, { short: true })}</td>
                      <td className="py-2 px-1 text-right font-mono">{u.activePlansCount}</td>
                      <td className="py-2 px-1 text-right">
                        {u.isAdmin ? (
                          <span className="text-[9px] bg-vault/15 text-vault px-1.5 py-0.5 rounded-md">Admin</span>
                        ) : (
                          <span className="text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md">Investor</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-text-subtle py-8">No investors match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Plans tab ── */}
      {sortKey === "plans" && (
        <Card>
          <CardHeader title={`Plan activity (${filtered.length})`} subtitle="Active & completed plans, deployed capital, and total earnings" />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] table-fixed min-w-[820px]">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="text-text-subtle text-left">
                  <th className="font-normal py-2 px-1">Name</th>
                  <th className="font-normal py-2 px-1">Email</th>
                  <th className="font-normal py-2 px-1 text-right">Active</th>
                  <th className="font-normal py-2 px-1 text-right">Deployed</th>
                  <th className="font-normal py-2 px-1 text-right">Completed</th>
                  <th className="font-normal py-2 px-1 text-right">Total Earned</th>
                  <th className="font-normal py-2 px-1 text-right">Role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.uid} className="border-t border-border hover:bg-card-elev/50 transition">
                    <td className="py-2 px-1"><p className="m-0 text-[11px] truncate font-medium">{u.name}</p></td>
                    <td className="py-2 px-1"><p className="m-0 text-[10px] text-text-muted truncate">{u.email}</p></td>
                    <td className="py-2 px-1 text-right font-mono">
                      {u.activePlansCount > 0 ? (
                        <span className="text-green">{u.activePlansCount}</span>
                      ) : (
                        <span className="text-text-subtle">0</span>
                      )}
                    </td>
                    <td className="py-2 px-1 text-right font-mono text-green">{formatPHP(u.deployed, { short: true })}</td>
                    <td className="py-2 px-1 text-right font-mono">{u.completedPlansCount}</td>
                    <td className="py-2 px-1 text-right font-mono text-vault">
                      {u.totalEarned > 0 ? `+${formatPHP(u.totalEarned, { short: true })}` : formatPHP(0)}
                    </td>
                    <td className="py-2 px-1 text-right">
                      {u.isAdmin ? (
                        <span className="text-[9px] bg-vault/15 text-vault px-1.5 py-0.5 rounded-md">Admin</span>
                      ) : (
                        <span className="text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md">Investor</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-text-subtle py-8">No investors match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Joined tab ── */}
      {sortKey === "joined" && (
        <Card>
          <CardHeader title={`All investors (${filtered.length})`} subtitle="Account overview sorted by join date" />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] table-fixed min-w-[780px]">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr className="text-text-subtle text-left">
                  <th className="font-normal py-2 px-1">Name</th>
                  <th className="font-normal py-2 px-1">Email</th>
                  <th className="font-normal py-2 px-1">Joined</th>
                  <th className="font-normal py-2 px-1 text-right">Active Plans</th>
                  <th className="font-normal py-2 px-1 text-right">Wallet</th>
                  <th className="font-normal py-2 px-1 text-right">Vault</th>
                  <th className="font-normal py-2 px-1 text-right">Role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.uid} className="border-t border-border hover:bg-card-elev/50 transition">
                    <td className="py-2 px-1"><p className="m-0 text-[11px] truncate font-medium">{u.name}</p></td>
                    <td className="py-2 px-1"><p className="m-0 text-[10px] text-text-muted truncate">{u.email}</p></td>
                    <td className="py-2 px-1 text-text-muted text-[10px]">{fmtDateShort(u.joinedAt)}</td>
                    <td className="py-2 px-1 text-right font-mono">{u.activePlansCount}</td>
                    <td className="py-2 px-1 text-right font-mono">{formatPHP(u.wallet, { short: true })}</td>
                    <td className="py-2 px-1 text-right font-mono text-vault">{formatPHP(u.vault, { short: true })}</td>
                    <td className="py-2 px-1 text-right">
                      {u.isAdmin ? (
                        <span className="text-[9px] bg-vault/15 text-vault px-1.5 py-0.5 rounded-md">Admin</span>
                      ) : (
                        <span className="text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md">Investor</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-text-subtle py-8">No investors match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
