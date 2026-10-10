"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search, RefreshCw, Download, ChevronDown, ChevronUp, Flame, Spade, Dices, Coins, ScrollText, LayoutGrid } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { listInvestors } from "@/lib/adminQueries";
import { useColorLeaderboard } from "@/lib/colorgame";
import {
  loadGameStats, loadPlayerGameDocs, useDailyTotals, loadLedger, adminSetPoints, exportRows, statsNet, ledgerDelta, ledgerSource, SOURCE_LABEL, n0,
  type GameStats, type PlayerGameDocs, type LedgerLine, type LedgerSource, type ExportColumn,
} from "@/lib/pointsAdmin";

type Sub = "overview" | "slot" | "tongits" | "color" | "ledger";
const SUBS: { id: Sub; label: string; icon: typeof Coins }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "slot", label: "Dragon Spire", icon: Flame },
  { id: "tongits", label: "Tongits", icon: Spade },
  { id: "color", label: "Color Game", icon: Dices },
  { id: "ledger", label: "Ledger", icon: ScrollText },
];
type Player = { uid: string; name: string; email: string; points: number; stats?: GameStats };
const mono = "font-mono tabular-nums";
const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");
const tone = (n: number) => (n > 0 ? "text-green" : n < 0 ? "text-red" : "text-text-subtle");
const when = (ms?: number) => (ms ? new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const input = "bg-canvas border border-border rounded-md px-2 py-1 text-[12px] text-text outline-none focus:border-gold/40";

/**
 * Admin › Game Settings › Players & points: every player's balance and where it
 * came from, per game, with a per-player ledger. Balances are edited through
 * adminSetPoints so a manual change is logged like any other movement.
 */
export function PlayerPointsPanel() {
  const [sub, setSub] = useState<Sub>("overview");
  const [players, setPlayers] = useState<Player[]>([]);
  const [docs, setDocs] = useState<PlayerGameDocs | null>(null);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const daily = useDailyTotals(7);

  async function load(spinner: boolean) {
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    if (spinner) setLoading(true);
    try {
      const [investors, game, stats] = await Promise.all([listInvestors(db, 1000), loadPlayerGameDocs(db), loadGameStats(db)]);
      const rows: Player[] = investors.map((i) => ({ uid: i.uid, name: i.name, email: i.email, points: game.state.get(i.uid)?.points ?? 0, stats: stats.get(i.uid) }));
      rows.sort((a, b) => b.points - a.points);
      setPlayers(rows); setDocs(game); setToday(new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to load players"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    // first load after mount; a refresh shows the spinner, the first load doesn't need to
    let alive = true;
    void Promise.resolve().then(() => { if (alive) void load(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return s ? players.filter((r) => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)) : players;
  }, [players, q]);

  const onPointsSaved = (uid: string, points: number, delta: number) => {
    setPlayers((ps) => ps.map((p) => (p.uid === uid ? { ...p, points, stats: { ...(p.stats ?? { uid }), admin: { edits: n0(p.stats?.admin?.edits) + 1, up: n0(p.stats?.admin?.up) + Math.max(0, delta), down: n0(p.stats?.admin?.down) + Math.max(0, -delta) } } } : p)));
  };

  return (
    <Card>
      <CardHeader
        title={`Players & points (${players.length})`}
        subtitle="Every player's Game Points and where they came from. Balance edits go through the ledger and the admin audit."
        right={<button onClick={() => load(true)} disabled={loading} className="text-[11px] px-2.5 py-1 rounded-md border border-border-strong text-text flex items-center gap-1 disabled:opacity-50"><RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} /> Refresh</button>}
      />
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 mb-3">
        {SUBS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSub(s.id)} className={cn("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition", sub === s.id ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted hover:text-text")}>
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>
      {err && <p className="text-[11px] text-red m-0 mb-2">{err}</p>}
      {sub !== "ledger" && (
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…" className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle" />
        </div>
      )}
      {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div> : (
        <>
          {sub === "overview" && <OverviewTab rows={filtered} all={players} daily={daily.sum} onSaved={onPointsSaved} />}
          {sub === "slot" && <SlotTab rows={filtered} docs={docs} today={today} />}
          {sub === "tongits" && <TongitsTab rows={filtered} docs={docs} />}
          {sub === "color" && <ColorTab rows={filtered} />}
          {sub === "ledger" && <LedgerTab players={players} />}
        </>
      )}
    </Card>
  );
}

/* ───────────── shared bits ───────────── */
function Tile({ label, value, sub, tone: t }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-canvas border border-border rounded-lg px-3 py-2.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1">{label}</p>
      <p className={cn("text-[15px] font-mono font-medium m-0 tabular-nums truncate", t)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5">{sub}</p>}
    </div>
  );
}
type Col<T> = { key: string; label: string; get: (r: T) => number | string; render?: (r: T) => React.ReactNode; right?: boolean; sortDefault?: "desc" };
function useSorted<T>(rows: T[], cols: Col<T>[], initial: string) {
  const [sortKey, setSortKey] = useState(initial);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const col = cols.find((c) => c.key === sortKey) ?? cols[0];
  const sorted = useMemo(() => {
    const out = rows.slice();
    out.sort((a, b) => { const x = col.get(a), y = col.get(b); const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return dir === "asc" ? r : -r; });
    return out;
  }, [rows, col, dir]);
  const toggle = (k: string) => { if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(k); setDir(k === "name" ? "asc" : "desc"); } };
  return { sorted, sortKey, dir, toggle };
}
function Table<T extends { uid: string }>({ rows, cols, initial, expand, footer }: { rows: T[]; cols: Col<T>[]; initial: string; expand?: (r: T) => React.ReactNode; footer?: React.ReactNode }) {
  const { sorted, sortKey, dir, toggle } = useSorted(rows, cols, initial);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[12px] min-w-[640px]">
        <thead>
          <tr className="text-[10px] text-text-subtle text-left">
            {cols.map((c) => (
              <th key={c.key} className={cn("font-medium py-1.5 pr-2 cursor-pointer select-none whitespace-nowrap", c.right && "text-right")} onClick={() => toggle(c.key)}>
                {c.label}{sortKey === c.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
            {expand && <th className="w-6" />}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={cols.length + 1} className="py-6 text-center text-text-subtle text-[11px]">Nobody matches.</td></tr>}
          {sorted.map((r) => (
            <RowGroup key={r.uid} r={r} cols={cols} expand={expand} open={open === r.uid} onToggle={() => setOpen(open === r.uid ? null : r.uid)} />
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
function RowGroup<T extends { uid: string }>({ r, cols, expand, open, onToggle }: { r: T; cols: Col<T>[]; expand?: (r: T) => React.ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-border">
        {cols.map((c) => <td key={c.key} className={cn("py-1.5 pr-2 whitespace-nowrap", c.right && "text-right", typeof c.get(r) === "number" && mono)}>{c.render ? c.render(r) : typeof c.get(r) === "number" ? fmt(c.get(r) as number) : c.get(r)}</td>)}
        {expand && <td className="py-1.5"><button onClick={onToggle} className="p-1 text-text-subtle hover:text-text" aria-label="Details">{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button></td>}
      </tr>
      {expand && open && <tr className="bg-canvas/60"><td colSpan={cols.length + 1} className="px-2 py-2">{expand(r)}</td></tr>}
    </>
  );
}
function ExportButtons<T>({ rows, cols, name, sheet }: { rows: T[]; cols: ExportColumn<T>[]; name: string; sheet: string }) {
  const [busy, setBusy] = useState(false);
  const go = async (f: "csv" | "xlsx") => { setBusy(true); try { await exportRows(rows, cols, name, f, sheet); } finally { setBusy(false); } };
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => go("xlsx")} disabled={busy || rows.length === 0} className="text-[10px] px-2 py-1 rounded-md border border-border-strong text-text flex items-center gap-1 disabled:opacity-50"><Download className="w-3 h-3" /> Excel</button>
      <button onClick={() => go("csv")} disabled={busy || rows.length === 0} className="text-[10px] px-2 py-1 rounded-md border border-border-strong text-text disabled:opacity-50">CSV</button>
    </div>
  );
}

/* ───────────── Overview ───────────── */
function OverviewTab({ rows, all, daily, onSaved }: { rows: Player[]; all: Player[]; daily: Record<string, number>; onSaved: (uid: string, points: number, delta: number) => void }) {
  const [edits, setEdits] = useState<Record<string, { points: string; note: string }>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inPlay = all.reduce((s, p) => s + p.points, 0);
  const given = n0(daily.slotWon) + n0(daily.tongitsWon) + n0(daily.colorWon) + n0(daily.reefWon) + n0(daily.eventWon);
  const lost = n0(daily.tongitsLost) + n0(daily.colorBet) + n0(daily.slotBet);
  async function save(p: Player) {
    const e = edits[p.uid];
    const n = Math.round(Number(e?.points));
    if (!e || e.points === "" || !Number.isFinite(n) || n < 0) return setMsg({ ok: false, text: "Enter a whole number of points." });
    setBusyUid(p.uid); setMsg(null);
    try {
      const r = await adminSetPoints(p.uid, n, e.note);
      onSaved(p.uid, r.after, r.delta);
      setEdits((x) => { const c = { ...x }; delete c[p.uid]; return c; });
      setMsg({ ok: true, text: `${p.name}: ${fmt(r.before)} → ${fmt(r.after)} (${signed(r.delta)}). Logged in the ledger and the audit.` });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message.replace(/^.*?:\s*/, "") : "Save failed" }); }
    finally { setBusyUid(null); }
  }
  const net = (p: Player) => statsNet(p.stats);
  const cols: Col<Player>[] = [
    { key: "name", label: "Player", get: (p) => p.name, render: (p) => <div className="min-w-0"><p className="m-0 truncate max-w-[160px]">{p.name}</p><p className="m-0 text-[9px] text-text-subtle truncate max-w-[160px]">{p.email}</p></div> },
    { key: "points", label: "Balance", right: true, get: (p) => p.points, render: (p) => (
      <div className="flex items-center justify-end gap-1">
        <input type="number" min={0} value={edits[p.uid]?.points ?? String(p.points)} onChange={(e) => setEdits({ ...edits, [p.uid]: { points: e.target.value, note: edits[p.uid]?.note ?? "" } })} className={cn(input, mono, "w-24 text-right")} aria-label={`Points for ${p.name}`} />
        {edits[p.uid] && edits[p.uid].points !== String(p.points) && (
          <>
            <input value={edits[p.uid].note} onChange={(e) => setEdits({ ...edits, [p.uid]: { ...edits[p.uid], note: e.target.value } })} placeholder="why?" className={cn(input, "w-24")} aria-label="Reason" />
            <button onClick={() => save(p)} disabled={busyUid === p.uid} className="px-2 py-1 rounded-md bg-gold text-gold-dark text-[10px] font-medium disabled:opacity-50 flex items-center gap-1">{busyUid === p.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save</button>
          </>
        )}
      </div>
    ) },
    { key: "slot", label: "Dragon Spire", right: true, get: (p) => net(p).slot, render: (p) => <span className={tone(net(p).slot)}>{signed(net(p).slot)}</span> },
    { key: "tongits", label: "Tongits", right: true, get: (p) => net(p).tongits, render: (p) => <span className={tone(net(p).tongits)}>{signed(net(p).tongits)}</span> },
    { key: "color", label: "Color", right: true, get: (p) => net(p).color, render: (p) => <span className={tone(net(p).color)}>{signed(net(p).color)}</span> },
    { key: "reef", label: "Reef", right: true, get: (p) => net(p).reef, render: (p) => <span className={tone(net(p).reef)}>{signed(net(p).reef)}</span> },
    { key: "event", label: "Events", right: true, get: (p) => net(p).event, render: (p) => <span className={tone(net(p).event)}>{signed(net(p).event)}</span> },
    { key: "reward", label: "Redeemed", right: true, get: (p) => -net(p).reward, render: (p) => <span>{fmt(-net(p).reward)}</span> },
    { key: "admin", label: "Admin", right: true, get: (p) => net(p).admin, render: (p) => <span className={tone(net(p).admin)}>{signed(net(p).admin)}</span> },
  ];
  const exportCols: ExportColumn<Player>[] = [
    { header: "Name", width: 28, get: (p) => p.name }, { header: "Email", width: 32, get: (p) => p.email }, { header: "Balance", width: 12, get: (p) => p.points, money: true },
    { header: "Dragon Spire net", width: 16, get: (p) => net(p).slot, money: true }, { header: "Tongits net", width: 14, get: (p) => net(p).tongits, money: true }, { header: "Color net", width: 12, get: (p) => net(p).color, money: true },
    { header: "Reef", width: 10, get: (p) => net(p).reef, money: true }, { header: "Events", width: 10, get: (p) => net(p).event, money: true }, { header: "Redeemed", width: 12, get: (p) => -net(p).reward, money: true }, { header: "Admin", width: 10, get: (p) => net(p).admin, money: true },
  ];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Tile label="Points in play" value={fmt(inPlay)} sub="all balances now" />
        <Tile label="Given by games · 7 d" value={`+${fmt(given)}`} sub="spins, cards, dice, reef, events" tone="text-green" />
        <Tile label="Lost to games · 7 d" value={`−${fmt(lost)}`} sub="Tongits losses, Color and paid-spin stakes" tone="text-red" />
        <Tile label="Redeemed · 7 d" value={fmt(n0(daily.redeemed))} sub={`${fmt(n0(daily.redemptions))} rewards · admin ${signed(n0(daily.adminUp) - n0(daily.adminDown))}`} />
      </div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] text-text-subtle m-0">Lifetime net per source. Tongits and Dragon Spire are backfilled; Color, Reef and Events count from the day the ledger went live.</p>
        <ExportButtons rows={rows} cols={exportCols} name="investure-points-overview" sheet="Points" />
      </div>
      {msg && <p className={cn("text-[11px] m-0 mb-2", msg.ok ? "text-green" : "text-red")}>{msg.text}</p>}
      <Table rows={rows} cols={cols} initial="points" />
    </>
  );
}

/* ───────────── Dragon Spire ───────────── */
type SlotRow = Player & { spins: number; won: number; wagered: number; jackpots: number; jackpotPoints: number; biggestWin: number; wonToday: number; lastAt?: number; potHistory: { pot: string; amount: number; at: number }[] };
function SlotTab({ rows, docs, today }: { rows: Player[]; docs: PlayerGameDocs | null; today: string }) {
  const data: SlotRow[] = rows.map((p) => { const d = docs?.slot.get(p.uid); const s = p.stats?.slot; return { ...p, spins: n0(s?.spins) || n0(d?.spins), won: n0(s?.won) || n0(d?.paid), wagered: n0(s?.wagered) || n0(d?.wagered), jackpots: n0(s?.jackpots), jackpotPoints: n0(s?.jackpotPoints), biggestWin: n0(d?.biggestWin), wonToday: d?.day === today ? n0(d?.wonToday) : 0, lastAt: d?.lastAt, potHistory: d?.potHistory ?? [] }; }).filter((r) => r.spins > 0 || r.won > 0);
  const paid = data.some((r) => r.wagered > 0);
  const tot = data.reduce((a, r) => ({ spins: a.spins + r.spins, won: a.won + r.won, wagered: a.wagered + r.wagered, jp: a.jp + r.jackpotPoints }), { spins: 0, won: 0, wagered: 0, jp: 0 });
  const cols: Col<SlotRow>[] = [
    { key: "name", label: "Player", get: (r) => r.name },
    { key: "spins", label: "Spins", right: true, get: (r) => r.spins },
    { key: "won", label: "Won", right: true, get: (r) => r.won, render: (r) => <span className="text-green">+{fmt(r.won)}</span> },
    ...(paid ? [{ key: "wagered", label: "Wagered", right: true, get: (r: SlotRow) => r.wagered }, { key: "net", label: "Net", right: true, get: (r: SlotRow) => r.won - r.wagered, render: (r: SlotRow) => <span className={tone(r.won - r.wagered)}>{signed(r.won - r.wagered)}</span> }] : []),
    { key: "jackpots", label: "Jackpots", right: true, get: (r) => r.jackpotPoints, render: (r) => r.jackpots ? `${r.jackpots} · ${fmt(r.jackpotPoints)}` : "—" },
    { key: "biggest", label: "Biggest win", right: true, get: (r) => r.biggestWin },
    { key: "today", label: "Won today", right: true, get: (r) => r.wonToday },
    { key: "last", label: "Last played", get: (r) => r.lastAt ?? 0, render: (r) => <span className="text-text-muted">{when(r.lastAt)}</span> },
  ];
  const exportCols: ExportColumn<SlotRow>[] = [{ header: "Name", width: 28, get: (r) => r.name }, { header: "Spins", width: 10, get: (r) => r.spins }, { header: "Won", width: 12, get: (r) => r.won, money: true }, { header: "Wagered", width: 12, get: (r) => r.wagered, money: true }, { header: "Jackpots", width: 10, get: (r) => r.jackpots }, { header: "Jackpot points", width: 14, get: (r) => r.jackpotPoints, money: true }, { header: "Biggest win", width: 12, get: (r) => r.biggestWin, money: true }, { header: "Last played", width: 20, get: (r) => when(r.lastAt) }];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Tile label="Players" value={fmt(data.length)} sub="have spun" />
        <Tile label="Spins" value={fmt(tot.spins)} sub="lifetime" />
        <Tile label="Points won" value={`+${fmt(tot.won)}`} sub={paid ? `wagered ${fmt(tot.wagered)}` : "free spins, no losses"} tone="text-green" />
        <Tile label="Jackpot points" value={fmt(tot.jp)} sub="Mini · Minor · Major · Grand" />
      </div>
      <div className="flex items-center justify-between gap-2 mb-2"><p className="text-[10px] text-text-subtle m-0">Free spins can&apos;t lose points. Open a row for the player&apos;s jackpot history.</p><ExportButtons rows={data} cols={exportCols} name="investure-points-dragon-spire" sheet="Dragon Spire" /></div>
      <Table rows={data} cols={cols} initial="won" expand={(r) => r.potHistory.length === 0 ? <p className="text-[11px] text-text-subtle m-0">No jackpots yet.</p> : (
        <div className="flex flex-wrap gap-1">{r.potHistory.slice().reverse().map((h, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/30">{h.pot.toUpperCase()} +{fmt(h.amount)} · {when(h.at)}</span>)}</div>
      )} />
    </>
  );
}

/* ───────────── Tongits ───────────── */
type TongitsRow = Player & { games: number; wins: number; losses: number; won: number; lost: number; rp: number; locked: number };
function TongitsTab({ rows, docs }: { rows: Player[]; docs: PlayerGameDocs | null }) {
  const data: TongitsRow[] = rows.map((p) => { const s = p.stats?.tongits; const st = docs?.state.get(p.uid); return { ...p, games: n0(s?.games) || n0(st?.tongitsGames), wins: n0(s?.wins) || n0(st?.tongitsWins), losses: n0(s?.losses) || n0(st?.tongitsLosses), won: n0(s?.won), lost: n0(s?.lost), rp: n0(st?.rankingPoints), locked: n0(st?.lockedPoints) }; }).filter((r) => r.games > 0);
  const tot = data.reduce((a, r) => ({ games: a.games + r.games, won: a.won + r.won, lost: a.lost + r.lost }), { games: 0, won: 0, lost: 0 });
  const cols: Col<TongitsRow>[] = [
    { key: "name", label: "Player", get: (r) => r.name },
    { key: "games", label: "Games", right: true, get: (r) => r.games },
    { key: "wl", label: "W – L", right: true, get: (r) => r.wins, render: (r) => `${r.wins} – ${r.losses}` },
    { key: "won", label: "Won", right: true, get: (r) => r.won, render: (r) => <span className="text-green">+{fmt(r.won)}</span> },
    { key: "lost", label: "Lost", right: true, get: (r) => r.lost, render: (r) => <span className="text-red">−{fmt(r.lost)}</span> },
    { key: "net", label: "Net", right: true, get: (r) => r.won - r.lost, render: (r) => <span className={tone(r.won - r.lost)}>{signed(r.won - r.lost)}</span> },
    { key: "rp", label: "Ranking pts", right: true, get: (r) => r.rp },
    { key: "locked", label: "In play now", right: true, get: (r) => r.locked, render: (r) => r.locked ? fmt(r.locked) : "—" },
  ];
  const exportCols: ExportColumn<TongitsRow>[] = [{ header: "Name", width: 28, get: (r) => r.name }, { header: "Games", width: 8, get: (r) => r.games }, { header: "Wins", width: 8, get: (r) => r.wins }, { header: "Losses", width: 8, get: (r) => r.losses }, { header: "Won", width: 12, get: (r) => r.won, money: true }, { header: "Lost", width: 12, get: (r) => r.lost, money: true }, { header: "Net", width: 12, get: (r) => r.won - r.lost, money: true }, { header: "Ranking points", width: 14, get: (r) => r.rp }];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Tile label="Players" value={fmt(data.length)} sub="have played" />
        <Tile label="Games" value={fmt(tot.games)} sub="player-games, lifetime" />
        <Tile label="Won" value={`+${fmt(tot.won)}`} sub="paid to winners" tone="text-green" />
        <Tile label="Lost" value={`−${fmt(tot.lost)}`} sub={`net to players ${signed(tot.won - tot.lost)}`} tone="text-red" />
      </div>
      <div className="flex items-center justify-between gap-2 mb-2"><p className="text-[10px] text-text-subtle m-0">Stakes locked at a table show under &ldquo;In play now&rdquo; until the match settles.</p><ExportButtons rows={data} cols={exportCols} name="investure-points-tongits" sheet="Tongits" /></div>
      <Table rows={data} cols={cols} initial="net" />
    </>
  );
}

/* ───────────── Color Game ───────────── */
type ColorRow = Player & { bets: number; bet: number; won: number; wins: number; wkBet: number; wkNet: number; wkRounds: number; wkBiggest: number };
function ColorTab({ rows }: { rows: Player[] }) {
  const week = useColorLeaderboard(500);
  const wk = useMemo(() => new Map(week.map((r) => [r.uid, r])), [week]);
  const data: ColorRow[] = rows.map((p) => { const s = p.stats?.color; const w = wk.get(p.uid); return { ...p, bets: n0(s?.bets), bet: n0(s?.bet), won: n0(s?.won), wins: n0(s?.wins), wkBet: n0(w?.totalBet), wkNet: n0(w?.totalWon), wkRounds: n0(w?.roundsPlayed), wkBiggest: n0(w?.biggestWin) }; }).filter((r) => r.bets > 0 || r.wkRounds > 0);
  const tot = data.reduce((a, r) => ({ bet: a.bet + r.bet, won: a.won + r.won, wkBet: a.wkBet + r.wkBet, wkNet: a.wkNet + r.wkNet }), { bet: 0, won: 0, wkBet: 0, wkNet: 0 });
  const cols: Col<ColorRow>[] = [
    { key: "name", label: "Player", get: (r) => r.name },
    { key: "bets", label: "Bets", right: true, get: (r) => r.bets },
    { key: "bet", label: "Staked", right: true, get: (r) => r.bet, render: (r) => <span className="text-red">−{fmt(r.bet)}</span> },
    { key: "won", label: "Paid out", right: true, get: (r) => r.won, render: (r) => <span className="text-green">+{fmt(r.won)}</span> },
    { key: "net", label: "Net", right: true, get: (r) => r.won - r.bet, render: (r) => <span className={tone(r.won - r.bet)}>{signed(r.won - r.bet)}</span> },
    { key: "wkRounds", label: "Rounds · wk", right: true, get: (r) => r.wkRounds },
    { key: "wkNet", label: "Net · wk", right: true, get: (r) => r.wkNet, render: (r) => <span className={tone(r.wkNet)}>{signed(r.wkNet)}</span> },
    { key: "wkBiggest", label: "Biggest · wk", right: true, get: (r) => r.wkBiggest },
  ];
  const exportCols: ExportColumn<ColorRow>[] = [{ header: "Name", width: 28, get: (r) => r.name }, { header: "Bets", width: 8, get: (r) => r.bets }, { header: "Staked", width: 12, get: (r) => r.bet, money: true }, { header: "Paid out", width: 12, get: (r) => r.won, money: true }, { header: "Net", width: 12, get: (r) => r.won - r.bet, money: true }, { header: "Rounds this week", width: 16, get: (r) => r.wkRounds }, { header: "Net this week", width: 14, get: (r) => r.wkNet, money: true }];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Tile label="Players" value={fmt(data.length)} sub="have bet" />
        <Tile label="Staked" value={`−${fmt(tot.bet)}`} sub="lifetime, since the ledger" tone="text-red" />
        <Tile label="Paid out" value={`+${fmt(tot.won)}`} sub={`net to players ${signed(tot.won - tot.bet)}`} tone="text-green" />
        <Tile label="This week" value={signed(tot.wkNet)} sub={`${fmt(tot.wkBet)} staked · resets Monday`} tone={tone(tot.wkNet)} />
      </div>
      <div className="flex items-center justify-between gap-2 mb-2"><p className="text-[10px] text-text-subtle m-0">Lifetime columns count from the day the ledger went live; &ldquo;wk&rdquo; columns are the weekly ranking that resets every Monday.</p><ExportButtons rows={data} cols={exportCols} name="investure-points-color-game" sheet="Color Game" /></div>
      <Table rows={data} cols={cols} initial="net" />
    </>
  );
}

/* ───────────── Ledger ───────────── */
function LedgerTab({ players }: { players: Player[] }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Player | null>(null);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<LedgerSource | "all">("all");
  const results = useMemo(() => { const s = q.trim().toLowerCase(); return s.length < 2 ? [] : players.filter((p) => p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s)).slice(0, 8); }, [q, players]);
  async function open(p: Player) {
    setPick(p); setQ(""); setBusy(true); setErr(null);
    const { db } = getFirebase();
    if (!db) return;
    try { setLines(await loadLedger(db, p.uid, 400)); } catch (e) { setErr(e instanceof Error ? e.message : "Could not load the ledger"); } finally { setBusy(false); }
  }
  const shown = lines.filter((l) => src === "all" || ledgerSource(l.type) === src);
  const sources = Array.from(new Set(lines.map((l) => ledgerSource(l.type))));
  const exportCols: ExportColumn<LedgerLine>[] = [{ header: "When", width: 20, get: (l) => when(l.createdAt) }, { header: "Source", width: 14, get: (l) => SOURCE_LABEL[ledgerSource(l.type)] }, { header: "Type", width: 22, get: (l) => l.type }, { header: "Description", width: 44, get: (l) => l.description }, { header: "Points", width: 10, get: (l) => ledgerDelta(l), money: true }, { header: "Balance after", width: 14, get: (l) => (typeof l.balanceAfter === "number" ? l.balanceAfter : "") }];
  return (
    <>
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick ? `Showing ${pick.name} · search another player…` : "Search a player to see every points movement…"} className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle" />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border-strong rounded-lg shadow-xl shadow-black/50 overflow-hidden">
            {results.map((r) => <button key={r.uid} onClick={() => open(r)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card-elev transition"><div className="flex-1 min-w-0"><p className="text-[11px] text-text m-0 truncate">{r.name}</p><p className="text-[9px] text-text-subtle m-0 truncate">{r.email}</p></div><span className={cn(mono, "text-[11px] text-gold")}>{fmt(r.points)}</span></button>)}
          </div>
        )}
      </div>
      {!pick ? <p className="text-[11px] text-text-subtle m-0 py-6 text-center">Pick a player. One line per movement: wins, losses, stakes, rewards and admin edits, newest first.</p> : busy ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div> : (
        <>
          {err && <p className="text-[11px] text-red m-0 mb-2">{err}</p>}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="text-[12px] m-0 flex-1"><span className="font-medium">{pick.name}</span> <span className="text-text-subtle">· balance</span> <span className={cn(mono, "text-gold")}>{fmt(pick.points)}</span> <span className="text-text-subtle">· {lines.length} line{lines.length === 1 ? "" : "s"}{lines.length >= 400 ? " (latest 400)" : ""}</span></p>
            <div className="flex gap-1 flex-wrap">
              {(["all", ...sources] as (LedgerSource | "all")[]).map((s) => <button key={s} onClick={() => setSrc(s)} className={cn("px-2 py-0.5 rounded-full text-[10px] border", src === s ? "bg-gold/15 border-gold/40 text-gold" : "bg-canvas border-border text-text-muted")}>{s === "all" ? "All" : SOURCE_LABEL[s]}</button>)}
            </div>
            <ExportButtons rows={shown} cols={exportCols} name={`investure-points-ledger_${pick.name.replace(/\s+/g, "-").toLowerCase()}`} sheet="Ledger" />
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead><tr className="text-[10px] text-text-subtle text-left"><th className="font-medium py-1.5 pr-2">When</th><th className="font-medium py-1.5 pr-2">Source</th><th className="font-medium py-1.5 pr-2">What</th><th className="font-medium py-1.5 pr-2 text-right">Points</th><th className="font-medium py-1.5 text-right">Balance after</th></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-text-subtle text-[11px]">No movements recorded yet.</td></tr>}
                {shown.map((l) => { const d = ledgerDelta(l); const s = ledgerSource(l.type); return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-text-muted">{when(l.createdAt)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{SOURCE_LABEL[s]}{l.test ? <span className="ml-1 text-[9px] text-[#7FE8C4]">test</span> : null}</td>
                    <td className="py-1.5 pr-2 min-w-[200px]">{l.description || l.type}</td>
                    <td className={cn("py-1.5 pr-2 text-right whitespace-nowrap", mono, tone(d))}>{signed(d)}</td>
                    <td className={cn("py-1.5 text-right whitespace-nowrap", mono, "text-text-muted")}>{typeof l.balanceAfter === "number" ? fmt(l.balanceAfter) : "—"}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
