"use client";

import { useEffect, useState } from "react";
import { Loader2, Dice1, Trophy, Coins, Users } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  useColorGameState,
  useColorLeaderboard,
  useColorJackpotConfig,
  adminAdjustJackpot,
  adminSetJackpotColor,
  adminSetJackpotConfig,
  ALL_COLORS,
  COLOR_HEX,
  COLOR_LABELS,
  type DieColor,
  type ColorGameState,
} from "@/lib/colorgame";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import { collection, getDocs, query, orderBy, limit, type Firestore } from "firebase/firestore";

type RecentRound = {
  roundId: string;
  dice: [DieColor, DieColor, DieColor];
  totalPool?: number;
  jackpotTriggered?: boolean;
  resolvedAt?: number;
  betCount: number;
};

export default function AdminColorGamePage() {
  const { user, demoMode } = useAuth();
  const gs = useColorGameState();
  const cfg = useColorJackpotConfig();
  const leaders = useColorLeaderboard(10);
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [floorInput, setFloorInput] = useState("");
  const [contribInput, setContribInput] = useState("");
  const [savingCfg, setSavingCfg] = useState(false);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [jackpotInput, setJackpotInput] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [settingColor, setSettingColor] = useState(false);
  const [tab, setTab] = useState<"dashboard" | "rounds" | "leaderboard">("dashboard");

  useEffect(() => {
    async function loadRounds() {
      const { gameDb } = getFirebase();
      if (!gameDb) { setLoadingRounds(false); return; }
      try {
        const q = query(
          collection(gameDb as Firestore, "color_rounds"),
          orderBy("resolvedAt", "desc"),
          limit(20),
        );
        const snap = await getDocs(q);
        setRecentRounds(snap.docs.map((d) => {
          const data = d.data();
          return {
            roundId: d.id,
            dice: data.dice ?? ["red", "red", "red"],
            totalPool: data.totalPool ?? 0,
            jackpotTriggered: data.jackpotTriggered ?? false,
            resolvedAt: data.resolvedAt ?? 0,
            betCount: Object.keys(data.bets ?? {}).length,
          };
        }));
      } catch { /* ignore */ }
      setLoadingRounds(false);
    }
    loadRounds();
  }, []);

  const handleJackpotAdjust = async () => {
    const val = parseInt(jackpotInput, 10);
    if (isNaN(val) || val < 0) return;
    setAdjusting(true);
    try {
      await adminAdjustJackpot(val);
      setJackpotInput("");
    } catch { /* ignore */ }
    setAdjusting(false);
  };

  const handleSetColor = async (color: DieColor) => {
    setSettingColor(true);
    try {
      await adminSetJackpotColor(color);
    } catch { /* ignore */ }
    setSettingColor(false);
  };

  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 500).then(setInvestors).catch(() => {});
  }, [demoMode]);

  const applyCfg = async (patch: Parameters<typeof adminSetJackpotConfig>[0]) => {
    setSavingCfg(true);
    try {
      await adminSetJackpotConfig(patch);
    } catch { /* ignore */ }
    setSavingCfg(false);
  };

  const playerMatches = playerSearch.trim()
    ? investors.filter((p) => {
        const q = playerSearch.toLowerCase();
        return p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  function fmtDate(ts: number) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const tabs = ["dashboard", "rounds", "leaderboard"] as const;

  return (
    <div>
      <TopHeader
        title="Color Game"
        subtitle={`${gs.totalRounds} rounds played · ${gs.jackpotPool} GP jackpot`}
      />

      <div className="flex gap-1 mb-3">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tab === t ? "bg-card-elev text-text" : "text-text-muted hover:bg-card-elev/50"
            }`}
          >
            {t === "dashboard" ? "Dashboard" : t === "rounds" ? "Recent Rounds" : "Leaderboard"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <KpiCard label="Total rounds" value={String(gs.totalRounds)} icon={Dice1} iconTone="blue" />
            <KpiCard label="Total wagered" value={`${gs.totalWagered ?? 0} GP`} icon={Coins} iconTone="green" />
            <KpiCard label="Jackpot pool" value={`${gs.jackpotPool} GP`} icon={Trophy} iconTone="gold" />
            <KpiCard label="Top players" value={String(leaders.length)} icon={Users} iconTone="blue" />
          </div>

          <Card className="mb-3">
            <CardHeader title="Jackpot management" />
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-text-subtle">
                Current: <span className="font-mono font-bold text-gold">{gs.jackpotPool} GP</span>
              </div>
              <input
                type="number"
                value={jackpotInput}
                onChange={(e) => setJackpotInput(e.target.value)}
                placeholder="New amount"
                className="w-28 px-2 py-1 rounded-md bg-card-elev text-[11px] text-text border border-border outline-none"
              />
              <button
                onClick={handleJackpotAdjust}
                disabled={adjusting || !jackpotInput}
                className="px-3 py-1 rounded-md bg-gold/15 text-gold text-[10px] font-medium disabled:opacity-50"
              >
                {adjusting ? "..." : "Set"}
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-text-subtle m-0 mb-2">
                Jackpot combination — players must hit 3 of this color to win the jackpot
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_COLORS.map((c) => {
                  const active = gs.jackpotColor === c;
                  return (
                    <button
                      key={c}
                      onClick={() => handleSetColor(c)}
                      disabled={settingColor}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                        active ? "border-gold bg-gold/10 text-text" : "border-border text-text-muted hover:border-gold/40"
                      }`}
                    >
                      <span className="w-4 h-4 rounded" style={{ background: COLOR_HEX[c], border: "1px solid rgba(255,255,255,0.5)" }} />
                      {COLOR_LABELS[c]}
                      {active && <span className="text-gold">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Designated winner + activation */}
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-text-subtle m-0 mb-2">
                Designated winner — when active, this player wins the jackpot the next time they bet the jackpot color (then it auto-deactivates)
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] text-text-muted">Status:</span>
                <span className={`text-[11px] font-medium ${cfg.jackpotActive ? "text-green" : "text-text-subtle"}`}>
                  {cfg.jackpotActive ? `Armed for ${cfg.jackpotTargetName || "—"}` : "Inactive"}
                </span>
                <button
                  onClick={() => applyCfg({ jackpotActive: !cfg.jackpotActive })}
                  disabled={savingCfg || (!cfg.jackpotTargetUid && !cfg.jackpotActive)}
                  className={`px-3 py-1 rounded-md text-[10px] font-medium disabled:opacity-50 ${cfg.jackpotActive ? "bg-red/15 text-red" : "bg-green/15 text-green"}`}
                >
                  {cfg.jackpotActive ? "Deactivate" : "Activate"}
                </button>
              </div>
              <input
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search player by name or email…"
                className="w-full max-w-sm px-2 py-1.5 rounded-md bg-card-elev text-[11px] text-text border border-border outline-none"
              />
              {playerMatches.length > 0 && (
                <div className="mt-1 max-w-sm border border-border rounded-md overflow-hidden">
                  {playerMatches.map((p) => (
                    <button
                      key={p.uid}
                      onClick={() => { applyCfg({ jackpotTargetUid: p.uid, jackpotTargetName: p.name || p.email || "Player" }); setPlayerSearch(""); }}
                      className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-card-elev flex items-center justify-between"
                    >
                      <span>{p.name || "—"} <span className="text-text-subtle">· {p.email}</span></span>
                      {cfg.jackpotTargetUid === p.uid && <span className="text-gold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-text-subtle m-0 mt-1">
                Selected winner: <span className="font-medium text-text">{cfg.jackpotTargetName || "none"}</span>
              </p>
            </div>

            {/* Floor + contribution */}
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-text-muted mb-1">Default floor — pool resets to this on a win</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={floorInput}
                    onChange={(e) => setFloorInput(e.target.value)}
                    placeholder={String(cfg.jackpotDefault)}
                    className="w-28 px-2 py-1 rounded-md bg-card-elev text-[11px] text-text border border-border outline-none"
                  />
                  <button
                    onClick={() => { const v = parseInt(floorInput, 10); if (!isNaN(v) && v >= 0) { applyCfg({ jackpotDefault: v }); setFloorInput(""); } }}
                    disabled={savingCfg || !floorInput}
                    className="px-3 py-1 rounded-md bg-gold/15 text-gold text-[10px] font-medium disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-text-muted mb-1">Contribution — % of each bet added to the pool</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={contribInput}
                    onChange={(e) => setContribInput(e.target.value)}
                    placeholder={(cfg.jackpotContribution * 100).toFixed(1)}
                    className="w-24 px-2 py-1 rounded-md bg-card-elev text-[11px] text-text border border-border outline-none"
                  />
                  <span className="text-[11px] text-text-subtle">%</span>
                  <button
                    onClick={() => { const v = parseFloat(contribInput); if (!isNaN(v) && v >= 0 && v <= 100) { applyCfg({ jackpotContribution: v / 100 }); setContribInput(""); } }}
                    disabled={savingCfg || !contribInput}
                    className="px-3 py-1 rounded-md bg-gold/15 text-gold text-[10px] font-medium disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Last 5 results" />
            <div className="flex gap-2 flex-wrap">
              {gs.history.slice(0, 5).map((h, i) => (
                <div key={i} className="flex gap-0.5 items-center bg-card-elev rounded-md px-2 py-1">
                  {h.dice.map((c, di) => (
                    <div
                      key={di}
                      className="w-4 h-4 rounded-sm"
                      style={{ backgroundColor: COLOR_HEX[c] }}
                      title={COLOR_LABELS[c]}
                    />
                  ))}
                </div>
              ))}
              {gs.history.length === 0 && (
                <span className="text-[11px] text-text-subtle">No rounds yet</span>
              )}
            </div>
          </Card>
        </>
      )}

      {tab === "rounds" && (
        <Card>
          <CardHeader title="Recent rounds" />
          {loadingRounds ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-vault" />
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[11px] table-fixed min-w-[500px]">
                <thead>
                  <tr className="text-text-subtle text-left">
                    <th className="font-normal py-1.5" style={{ width: "15%" }}>Round</th>
                    <th className="font-normal py-1.5" style={{ width: "25%" }}>Dice</th>
                    <th className="font-normal py-1.5 text-right" style={{ width: "15%" }}>Pool</th>
                    <th className="font-normal py-1.5 text-right" style={{ width: "10%" }}>Bets</th>
                    <th className="font-normal py-1.5 text-right" style={{ width: "15%" }}>Jackpot</th>
                    <th className="font-normal py-1.5 text-right" style={{ width: "20%" }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRounds.map((r) => (
                    <tr key={r.roundId} className="border-t border-border">
                      <td className="py-1.5 font-mono text-text-subtle">#{r.roundId.slice(-5)}</td>
                      <td className="py-1.5">
                        <div className="flex gap-0.5">
                          {r.dice.map((c, i) => (
                            <div
                              key={i}
                              className="w-4 h-4 rounded-sm"
                              style={{ backgroundColor: COLOR_HEX[c] }}
                              title={COLOR_LABELS[c]}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="py-1.5 text-right font-mono">{r.totalPool ?? 0}</td>
                      <td className="py-1.5 text-right">{r.betCount}</td>
                      <td className="py-1.5 text-right">
                        {r.jackpotTriggered ? (
                          <span className="text-gold font-bold">HIT</span>
                        ) : (
                          <span className="text-text-subtle">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-text-subtle">{fmtDate(r.resolvedAt ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "leaderboard" && (
        <Card>
          <CardHeader title="Top players" />
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] table-fixed min-w-[500px]">
              <thead>
                <tr className="text-text-subtle text-left">
                  <th className="font-normal py-1.5" style={{ width: "5%" }}>#</th>
                  <th className="font-normal py-1.5" style={{ width: "30%" }}>Player</th>
                  <th className="font-normal py-1.5 text-right" style={{ width: "18%" }}>Total Won</th>
                  <th className="font-normal py-1.5 text-right" style={{ width: "18%" }}>Total Bet</th>
                  <th className="font-normal py-1.5 text-right" style={{ width: "12%" }}>Rounds</th>
                  <th className="font-normal py-1.5 text-right" style={{ width: "17%" }}>Biggest Win</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l, i) => (
                  <tr key={l.uid} className="border-t border-border">
                    <td className={`py-1.5 font-bold ${i === 0 ? "text-gold" : i === 1 ? "text-text-subtle" : i === 2 ? "text-orange-400" : "text-text-muted"}`}>
                      {i + 1}
                    </td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-blue/15 text-blue text-[9px] font-bold flex items-center justify-center">
                          {(l.name?.[0] ?? "?").toUpperCase()}
                        </div>
                        <span className="truncate">{l.name}</span>
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono text-green">{l.totalWon}</td>
                    <td className="py-1.5 text-right font-mono">{l.totalBet}</td>
                    <td className="py-1.5 text-right">{l.roundsPlayed}</td>
                    <td className="py-1.5 text-right font-mono text-gold">{l.biggestWin}</td>
                  </tr>
                ))}
                {leaders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-text-subtle">No players yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
