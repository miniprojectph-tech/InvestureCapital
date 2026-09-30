"use client";

import { useEffect, useState } from "react";
import { Loader2, Dice1, Trophy, Coins, Users } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { ResponsiveTable } from "@/components/ResponsiveTable";
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
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
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

  // Keeps the jackpot status line ("starts in…", "live until…") current.
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(iv);
  }, []);

  const applyCfg = async (patch: Parameters<typeof adminSetJackpotConfig>[0]) => {
    setSavingCfg(true);
    setCfgError(null);
    try {
      await adminSetJackpotConfig(patch);
      return true;
    } catch (e) {
      setCfgError(e instanceof Error ? e.message : "Could not save. Please try again.");
      return false;
    } finally {
      setSavingCfg(false);
    }
  };

  const scheduleJackpot = async () => {
    const start = new Date(winStart).getTime();
    const end = new Date(winEnd).getTime();
    if (!winStart || !winEnd || isNaN(start) || isNaN(end)) return setCfgError("Choose both a start and an end date and time.");
    if (end <= start) return setCfgError("The end must be after the start.");
    if (end <= Date.now()) return setCfgError("The end must be in the future.");
    if (await applyCfg({ jackpotWindowStart: start, jackpotWindowEnd: end })) {
      setWinStart("");
      setWinEnd("");
    }
  };

  const fmtFull = (ts: number) =>
    new Date(ts).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const jackpotStatus: { label: string; tone: string } = !cfg.jackpotActive
    ? { label: "Off — no jackpot scheduled", tone: "text-text-subtle" }
    : now < cfg.jackpotWindowStart
      ? { label: `Scheduled — starts ${fmtFull(cfg.jackpotWindowStart)}`, tone: "text-blue" }
      : now <= cfg.jackpotWindowEnd
        ? { label: `LIVE — can hit any time until ${fmtFull(cfg.jackpotWindowEnd)}`, tone: "text-green" }
        : { label: "Ended without a winner — nobody bet the jackpot color in time", tone: "text-text-subtle" };

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
                Jackpot color — when the jackpot hits, all three dice land on this color
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

            {/* Jackpot schedule */}
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[12px] font-medium text-text m-0 mb-1">Jackpot schedule</p>
              <p className="text-[11px] text-text-subtle m-0 mb-2 max-w-2xl leading-relaxed">
                Set a start and an end. The jackpot hits at a random moment inside that time — nobody is chosen and
                nobody knows the moment, not even this page. Everyone who bet the jackpot color in that round shares
                the prize, by how much each of them bet on it. After it hits it turns itself off and the pool goes
                back to the default prize below.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[11px] text-text-muted">Status:</span>
                <span className={`text-[11px] font-medium ${jackpotStatus.tone}`}>{jackpotStatus.label}</span>
                {cfg.jackpotActive && (
                  <button
                    onClick={() => applyCfg({ jackpotActive: false })}
                    disabled={savingCfg}
                    className="px-3 py-1 rounded-md text-[10px] font-medium bg-red/15 text-red disabled:opacity-50"
                  >
                    {now > cfg.jackpotWindowEnd ? "Clear" : "Cancel jackpot"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">Starts</label>
                  <input
                    type="datetime-local"
                    value={winStart}
                    onChange={(e) => setWinStart(e.target.value)}
                    className="px-2 py-1.5 rounded-md bg-card-elev text-[11px] text-text border border-border outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">Ends</label>
                  <input
                    type="datetime-local"
                    value={winEnd}
                    onChange={(e) => setWinEnd(e.target.value)}
                    className="px-2 py-1.5 rounded-md bg-card-elev text-[11px] text-text border border-border outline-none"
                  />
                </div>
                <button
                  onClick={scheduleJackpot}
                  disabled={savingCfg || !winStart || !winEnd}
                  className="px-3 py-1.5 rounded-md bg-green/15 text-green text-[11px] font-medium disabled:opacity-50"
                >
                  {savingCfg ? "Saving…" : cfg.jackpotActive ? "Replace schedule" : "Schedule jackpot"}
                </button>
              </div>
              <p className="text-[10px] text-text-subtle m-0 mt-1.5">
                Times are in this device&apos;s time zone. The jackpot needs at least 5 minutes, and at least one player
                betting the jackpot color, to hit.
              </p>
              {cfgError && <p className="text-[11px] text-red m-0 mt-1.5">{cfgError}</p>}
              {cfg.jackpotLastHit && (
                <p className="text-[11px] text-text-muted m-0 mt-2">
                  Last jackpot: <span className="font-mono text-gold">{cfg.jackpotLastHit.amount.toLocaleString()} GP</span> shared by{" "}
                  {cfg.jackpotLastHit.winners} player{cfg.jackpotLastHit.winners === 1 ? "" : "s"} · {fmtFull(cfg.jackpotLastHit.at)}
                </p>
              )}
            </div>

            {/* Floor + contribution */}
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-text-muted mb-1">Default prize — the pool goes back to this after a jackpot is won</label>
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
            <ResponsiveTable>
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
            </ResponsiveTable>
          )}
        </Card>
      )}

      {tab === "leaderboard" && (
        <Card>
          <CardHeader title="Top players" />
          <ResponsiveTable>
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
          </ResponsiveTable>
        </Card>
      )}
    </div>
  );
}
