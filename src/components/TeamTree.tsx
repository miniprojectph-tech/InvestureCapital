"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Search, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { cn, formatPHP } from "@/lib/utils";
import type { ReferralStats, TeamNode } from "@/lib/compplan";

/** Teams up to this size open fully expanded; bigger ones start at level 1 so the page stays light. */
const AUTO_EXPAND_MAX = 150;

/**
 * The member's team as a tree: direct invites, their invites, and so on down
 * the commission levels. Tap a person to open or close their branch.
 *
 * Names below level 1 arrive already masked from the server, and no amounts
 * are sent — except to an admin viewing a member, who gets full names and the
 * amount each person has placed.
 */
export function TeamTree({ stats, loading }: { stats: ReferralStats | null; loading: boolean }) {
  const nodes = useMemo<TeamNode[]>(() => stats?.tree ?? [], [stats]);
  const [query, setQuery] = useState("");
  // null = "use the default" (everything open for small teams, level 1 only for big ones)
  const [open, setOpen] = useState<Set<number> | null>(null);

  // children of each node, by position in the list (-1 = the member's own direct invites)
  const kids = useMemo(() => {
    const m = new Map<number, number[]>();
    nodes.forEach((n, i) => {
      const list = m.get(n.p);
      if (list) list.push(i); else m.set(n.p, [i]);
    });
    // active first, then the biggest branches, then the newest
    for (const list of m.values()) list.sort((a, b) => Number(nodes[b].a) - Number(nodes[a].a) || nodes[b].c - nodes[a].c || nodes[b].j - nodes[a].j);
    return m;
  }, [nodes]);

  const withKids = useMemo(() => nodes.map((_, i) => i).filter((i) => (kids.get(i)?.length ?? 0) > 0), [nodes, kids]);
  const expanded = open ?? (nodes.length <= AUTO_EXPAND_MAX ? new Set(withKids) : new Set<number>());

  // Search: show the matches and the people above them, with those branches open.
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return null;
    const keep = new Set<number>();
    nodes.forEach((n, i) => {
      if (!n.n.toLowerCase().includes(q)) return;
      for (let at = i; at >= 0 && !keep.has(at); at = nodes[at].p) keep.add(at);
    });
    return keep;
  }, [q, nodes]);

  const toggle = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i); else next.add(i);
    setOpen(next);
  };

  const levels = nodes.reduce((m, n) => Math.max(m, n.l), 0);
  const allOpen = withKids.length > 0 && withKids.every((i) => expanded.has(i));

  function render(parent: number): React.ReactNode {
    const list = (kids.get(parent) ?? []).filter((i) => !visible || visible.has(i));
    if (list.length === 0) return null;
    return list.map((i) => {
      const n = nodes[i];
      const count = kids.get(i)?.length ?? 0;
      const isOpen = !!visible || expanded.has(i);
      const top = n.l === 1;
      return (
        <div key={i}>
          <button
            type="button"
            data-viewas-ok
            onClick={() => count > 0 && !visible && toggle(i)}
            aria-expanded={count > 0 ? isOpen : undefined}
            className={cn("w-full flex items-center gap-2 py-2 text-left", top && "border-t border-border", count > 0 && !visible ? "cursor-pointer" : "cursor-default")}
          >
            <span className="w-4 shrink-0 text-text-subtle">
              {count > 0 ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
            </span>
            <span className={cn("w-2 h-2 rounded-full shrink-0", n.a ? "bg-green" : "bg-border-strong")} title={n.a ? "Has a placement" : "Not active yet"} />
            <span className={cn("flex-1 min-w-0 truncate text-[12.5px]", top ? "font-medium text-text" : n.m ? "font-mono text-text" : "text-text")}>{n.n}</span>
            {typeof n.amt === "number" && n.amt > 0 && <span className="text-[11px] font-mono text-gold shrink-0">{formatPHP(n.amt, { short: true })}</span>}
            <span className="text-[10px] text-text-subtle shrink-0 whitespace-nowrap hidden sm:inline">
              {top ? (n.j ? `Joined ${new Date(n.j).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}` : "") : `Level ${n.l}`}
              {!n.a && " · not active yet"}
            </span>
            {count > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue/15 text-blue shrink-0 whitespace-nowrap">{count} invite{count === 1 ? "" : "s"}</span>}
          </button>
          {isOpen && count > 0 && <div className="ml-[7px] pl-3.5 border-l border-border-strong">{render(i)}</div>}
        </div>
      );
    });
  }

  return (
    <Card className="mb-3">
      <CardHeader
        title="My team"
        subtitle={nodes.length > 0 ? `${nodes.length.toLocaleString()} ${nodes.length === 1 ? "person" : "people"} across ${levels} level${levels === 1 ? "" : "s"} — tap a name to open their invites` : "Everyone you invited, and everyone they invited"}
        right={<Users className="w-4 h-4 text-text-subtle" />}
      />
      {loading && !stats ? (
        <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
      ) : nodes.length === 0 ? (
        <p className="text-[12px] text-text-muted m-0 py-4">No one in your team yet. Share your referral link above — everyone who signs up with it appears here.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-canvas border border-border rounded-lg flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-text-subtle shrink-0" />
              <input data-viewas-ok value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name in your team" className="bg-transparent text-[12px] text-text outline-none flex-1 min-w-0" />
            </label>
            {withKids.length > 0 && !q && (
              <button type="button" data-viewas-ok onClick={() => setOpen(allOpen ? new Set() : new Set(withKids))} className="text-[11px] text-gold hover:underline whitespace-nowrap">
                {allOpen ? "Close all" : "Open all"}
              </button>
            )}
          </div>

          {visible && visible.size === 0 ? (
            <p className="text-[12px] text-text-muted m-0 py-3">No one in your team matches “{query.trim()}”.</p>
          ) : (
            <div>{render(-1)}</div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-text-subtle">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green" /> Has a placement</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-border-strong" /> Not active yet</span>
            {stats?.truncated && <span>Showing the first {nodes.length.toLocaleString()} people.</span>}
          </div>
        </>
      )}
    </Card>
  );
}
