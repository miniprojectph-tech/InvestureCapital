"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { getFirebase } from "@/lib/firebase";
import { listInvestors } from "@/lib/adminQueries";
import { adminListGameStates, adminSaveGameState } from "@/lib/game";

type Row = { uid: string; name: string; email: string; points: number };

export function PlayerPointsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { db } = getFirebase();
    if (!db) { setLoading(false); return; }
    setLoading(true);
    setErr(null);
    try {
      const [investors, states] = await Promise.all([listInvestors(db, 500), adminListGameStates(db)]);
      const pointsByUid = new Map(states.map((s) => [s.uid, s.points]));
      const merged: Row[] = investors.map((i) => ({
        uid: i.uid,
        name: i.name,
        email: i.email,
        points: pointsByUid.get(i.uid) ?? 0,
      }));
      merged.sort((a, b) => b.points - a.points);
      setRows(merged);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return s
      ? rows.filter((r) => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s))
      : rows;
  }, [rows, q]);

  async function savePoints(row: Row) {
    const { db } = getFirebase();
    if (!db) return;
    const raw = edits[row.uid];
    const n = Math.max(0, Math.round(Number(raw)));
    if (raw === undefined || raw === "" || Number.isNaN(Number(raw))) { setErr("Enter a valid number"); return; }
    setBusyUid(row.uid); setErr(null); setMsg(null);
    try {
      await adminSaveGameState(db, row.uid, { points: n });
      setRows((rs) => rs.map((r) => (r.uid === row.uid ? { ...r, points: n } : r)));
      setEdits((x) => { const c = { ...x }; delete c[row.uid]; return c; });
      setMsg(`Set ${row.name || row.email || row.uid} to ${n.toLocaleString()} GP`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title={`Players & points (${rows.length})`}
        subtitle="Browse every player's Game Points and edit them for testing"
        right={
          <button
            onClick={load}
            className="text-[11px] px-2.5 py-1 bg-vault/15 text-vault rounded-md"
          >
            Refresh
          </button>
        }
      />

      {msg && (
        <div className="mb-2 px-3 py-2 bg-green/10 border border-green/30 rounded-lg text-[11px] text-green">{msg}</div>
      )}
      {err && (
        <div className="mb-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">{err}</div>
      )}

      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="w-full bg-canvas border border-border rounded-md pl-9 pr-3 py-2 text-[13px] text-text outline-none focus:border-gold/40"
        />
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-[11px] text-text-subtle text-center py-6 m-0">No players found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-text-muted text-[10px] uppercase tracking-wider border-b border-border">
                <th className="text-left py-2 px-1">Player</th>
                <th className="text-right py-2 px-1">Current GP</th>
                <th className="text-right py-2 px-1">Set to</th>
                <th className="py-2 px-1" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const dirty = edits[r.uid] !== undefined && edits[r.uid] !== "";
                return (
                  <tr key={r.uid} className="border-b border-border/50">
                    <td className="py-2 px-1">
                      <p className="m-0 font-medium truncate max-w-[200px]">{r.name || "—"}</p>
                      <p className="m-0 text-[10px] text-text-subtle truncate max-w-[200px]">{r.email}</p>
                    </td>
                    <td className="py-2 px-1 text-right font-mono text-vault">{r.points.toLocaleString()}</td>
                    <td className="py-2 px-1 text-right">
                      <input
                        type="number"
                        value={edits[r.uid] ?? ""}
                        placeholder={String(r.points)}
                        onChange={(e) => setEdits((x) => ({ ...x, [r.uid]: e.target.value }))}
                        className="w-24 bg-canvas border border-border rounded-md px-2 py-1 text-[12px] font-mono text-right text-text outline-none focus:border-gold/40"
                      />
                    </td>
                    <td className="py-2 px-1 text-right">
                      <button
                        onClick={() => savePoints(r)}
                        disabled={busyUid === r.uid || !dirty}
                        className="text-[11px] px-2.5 py-1 bg-gold/15 text-gold rounded-md inline-flex items-center gap-1 disabled:opacity-40"
                      >
                        {busyUid === r.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Set
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
