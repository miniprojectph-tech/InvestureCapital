"use client";

import { useEffect, useState } from "react";
import { Trophy, RotateCcw, Loader2, CheckCircle2, AlertCircle, UserMinus } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useLeaderboard } from "@/lib/game";
import { useTongitsLeaderboard } from "@/lib/tongits-social";
import { useColorLeaderboard } from "@/lib/colorgame";
import { manilaWeekKey, resetsIn } from "@/lib/week";
import { adminResetRankings, adminRemoveFromRanking, RANKING_LABEL, type RankingGame } from "@/lib/rankings";

type Row = { uid: string; name: string; score: number; detail: string };

export default function AdminRankingsPage() {
  const { user } = useAuth();
  const reef = useLeaderboard(50);
  const tongits = useTongitsLeaderboard("week", 50);
  const color = useColorLeaderboard(50);

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!user?.isAdmin) return null;

  const boards: { game: RankingGame; unit: string; note: string; loading: boolean; rows: Row[] }[] = [
    {
      game: "reef",
      unit: "pts",
      note: "Weekly score from fishing. Top players are paid the weekly prizes on Monday.",
      loading: reef.loading,
      rows: reef.rows.map((r) => ({ uid: r.uid, name: r.name, score: r.weeklyScore, detail: "weekly score" })),
    },
    {
      game: "tongits",
      unit: "RP",
      note: "Ranking points earned this week.",
      loading: tongits.loading,
      rows: tongits.rows.map((r) => ({ uid: r.uid, name: r.name, score: r.weekRP ?? 0, detail: `${r.wins}W · ${r.games} games` })),
    },
    {
      game: "color",
      unit: "GP",
      note: "Net winnings this week.",
      loading: false,
      rows: color.map((r) => ({ uid: r.uid, name: r.name, score: r.totalWon, detail: `${r.roundsPlayed} rounds · bet ${r.totalBet.toLocaleString()}` })),
    },
  ];

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(null);
    }
  }

  function reset(games: RankingGame[]) {
    const names = games.map((g) => RANKING_LABEL[g]).join(", ");
    if (!window.confirm(`Reset the ${names} ranking${games.length > 1 ? "s" : ""}? Every player's ranking score goes back to zero. Game Points balances are not changed. This can't be undone.`)) return;
    run(`reset-${games.join("-")}`, async () => {
      const r = await adminResetRankings(games);
      return games.map((g) => `${RANKING_LABEL[g]}: ${r.cleared[g] ?? 0} player${(r.cleared[g] ?? 0) === 1 ? "" : "s"} cleared`).join(" · ");
    });
  }

  function removePlayer(game: RankingGame, row: Row, everywhere: boolean) {
    const games: RankingGame[] = everywhere ? ["reef", "tongits", "color"] : [game];
    if (!window.confirm(`Remove ${row.name} from ${everywhere ? "all three rankings" : `the ${RANKING_LABEL[game]} ranking`}? Their Game Points are not changed.`)) return;
    run(`rm-${game}-${row.uid}`, async () => {
      await adminRemoveFromRanking(games, row.uid);
      return `${row.name} removed from ${everywhere ? "all rankings" : `the ${RANKING_LABEL[game]} ranking`}.`;
    });
  }

  return (
    <div>
      <TopHeader title="Rankings" subtitle={`All rankings are weekly · week ${manilaWeekKey(now)} · resets Monday 12:00 AM Manila, in ${resetsIn(now)}`} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => reset(["reef", "tongits", "color"])}
          disabled={!!busy}
          className="px-3.5 py-2 rounded-lg text-[12px] font-medium border border-red/40 text-red hover:bg-red/10 flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy === "reset-reef-tongits-color" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reset all rankings
        </button>
        <p className="text-[11px] text-text-subtle m-0">Use this after test accounts have played. Only ranking scores are cleared, never Game Points.</p>
      </div>

      {msg && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-start gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        {boards.map((b) => (
          <Card key={b.game}>
            <CardHeader
              title={`${RANKING_LABEL[b.game]} · weekly`}
              subtitle={b.note}
              right={
                <button
                  onClick={() => reset([b.game])}
                  disabled={!!busy}
                  className="text-[10px] px-2 py-1 rounded-md border border-red/30 text-red hover:bg-red/10 inline-flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                >
                  {busy === `reset-${b.game}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Reset
                </button>
              }
            />
            {b.loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
            ) : b.rows.length === 0 ? (
              <div className="py-8 text-center">
                <Trophy className="w-5 h-5 text-text-subtle mx-auto mb-1.5" />
                <p className="text-[11px] text-text-subtle m-0">No ranked players this week.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {b.rows.map((r, i) => (
                  <div key={r.uid} className="group flex items-center gap-2.5 py-2 border-t border-border first:border-t-0">
                    <span className={cn("w-5 text-center text-[12px] font-bold shrink-0", i === 0 ? "text-[#F5C66B]" : i < 3 ? "text-text" : "text-text-subtle")}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] m-0 truncate">{r.name}</p>
                      <p className="text-[10px] text-text-subtle m-0 truncate">{r.detail}</p>
                    </div>
                    <span className="font-mono text-[12px] text-gold whitespace-nowrap">{r.score.toLocaleString()} <span className="text-[9px] text-text-subtle">{b.unit}</span></span>
                    <button
                      onClick={(e) => removePlayer(b.game, r, e.shiftKey)}
                      disabled={!!busy}
                      title="Remove from this ranking (Shift-click: remove from all three)"
                      aria-label={`Remove ${r.name} from the ${RANKING_LABEL[b.game]} ranking`}
                      className="w-7 h-7 rounded-md text-text-subtle hover:text-red hover:bg-red/10 flex items-center justify-center shrink-0 disabled:opacity-50"
                    >
                      {busy === `rm-${b.game}-${r.uid}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <p className="text-[10px] text-text-subtle mt-3 m-0">
        The person icon removes one player from that ranking. Hold Shift while clicking to remove them from all three. Rank tiers, match history and balances stay as they are.
      </p>
    </div>
  );
}
