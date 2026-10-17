"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, Loader2, Plus, Search, X } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import { useTeamLeaders, addTeamLeader, setTeamLeaderBadge, removeTeamLeader, formatRelative } from "@/lib/community";

/**
 * Admin › Community chat › Moderators & leaders: who is a Team Leader. A leader posts in
 * the room under their own name with a "Team Leader" chip (switchable per leader and
 * globally), may always send pictures, video and links, and can message members directly.
 */
export function TeamLeadersCard({ enabled, demoMode, adminUid }: { enabled: boolean; demoMode: boolean; adminUid: string }) {
  const leaders = useTeamLeaders(enabled);
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 1000).then(setInvestors).catch(() => {});
  }, [demoMode]);

  const ids = useMemo(() => new Set(leaders.map((l) => l.uid)), [leaders]);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return investors.filter((i) => !i.isAdmin && !ids.has(i.uid) && (i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q))).slice(0, 6);
  }, [search, investors, ids]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader title="Team Leaders" subtitle="Members who guide others: their own name with a “Team Leader” chip in the room, media and links allowed, and direct messages to any member." right={<Crown className="w-4 h-4 text-[#5CE0D2]" />} />
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a member to add…" disabled={!enabled} className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle disabled:opacity-50" />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border-strong rounded-lg shadow-xl shadow-black/50 overflow-hidden">
            {results.map((r) => (
              <button key={r.uid} onClick={() => run(r.uid, async () => { await addTeamLeader(r.uid, r.name, adminUid); setSearch(""); })} disabled={busy === r.uid} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card-elev transition">
                <div className="flex-1 min-w-0"><p className="text-[11px] text-text m-0 truncate">{r.name}</p><p className="text-[9px] text-text-subtle m-0 truncate">{r.email}</p></div>
                {busy === r.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" /> : <Plus className="w-3.5 h-3.5 text-gold" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-[10px] text-red m-0 mb-2">{error}</p>}
      {leaders.length === 0 ? <p className="text-[11px] text-text-subtle m-0">No Team Leaders yet. Search a member above to add one.</p> : (
        <div className="flex flex-col gap-1">
          {leaders.map((l) => (
            <div key={l.uid} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
              <Crown className="w-3.5 h-3.5 text-[#5CE0D2] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text m-0 truncate">{l.name}</p>
                <p className="text-[9px] text-text-subtle m-0">since {formatRelative(l.at)} ago</p>
              </div>
              <button
                onClick={() => run(`badge-${l.uid}`, () => setTeamLeaderBadge(l.uid, l.name, !l.badge, adminUid))}
                disabled={busy === `badge-${l.uid}`}
                title="Show or hide the “Team Leader” chip after this leader's name in the room"
                className={cn("text-[9px] px-2 py-1 rounded-md border transition", l.badge ? "bg-[#5CE0D2]/15 text-[#5CE0D2] border-[#5CE0D2]/30" : "bg-card-elev text-text-muted border-transparent hover:text-text")}
              >
                Chip {l.badge ? "on" : "off"}
              </button>
              <button onClick={() => run(`rm-${l.uid}`, () => removeTeamLeader(l.uid, l.name, adminUid))} disabled={busy === `rm-${l.uid}`} className="p-1 text-text-subtle hover:text-red transition" aria-label={`Remove ${l.name} as Team Leader`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[9px] text-text-subtle m-0 mt-3 leading-relaxed">
        Leaders are ordinary members otherwise: no ⋯ moderation menu and no access to this admin panel. Adding, removing and the chip switch are written to the admin audit.
      </p>
    </Card>
  );
}
