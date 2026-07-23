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
  adminAdjustJackpot,
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
  const leaders = useColorLeaderboard(10);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [jackpotInput, setJackpotInput] = useState("");
  const [adjusting, setAdjusting] = useState(false);
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
