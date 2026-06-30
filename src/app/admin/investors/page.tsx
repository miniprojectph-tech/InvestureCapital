"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download, MoreVertical } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";

const mock: InvestorRow[] = [
  { uid: "tw", name: "Theresa Webb", email: "theresa@mail.com", wallet: 250, vault: 9445, activePlansCount: 3, joinedAt: Date.now() - 50*86400000, isAdmin: false },
  { uid: "am", name: "Arlene McCoy", email: "arlene@mail.com", wallet: 120, vault: 3200, activePlansCount: 2, joinedAt: Date.now() - 30*86400000, isAdmin: false },
  { uid: "jb", name: "Jerome Bell", email: "jerome@mail.com", wallet: 890, vault: 24180, activePlansCount: 5, joinedAt: Date.now() - 100*86400000, isAdmin: true },
  { uid: "re", name: "Ralph Edwards", email: "ralph@mail.com", wallet: 0, vault: 0, activePlansCount: 0, joinedAt: Date.now() - 2*86400000, isAdmin: false },
  { uid: "dl", name: "Devon Lane", email: "devon@mail.com", wallet: 420, vault: 5620, activePlansCount: 2, joinedAt: Date.now() - 18*86400000, isAdmin: false },
  { uid: "kw", name: "Kristin Watson", email: "kristin@mail.com", wallet: 180, vault: 1450, activePlansCount: 1, joinedAt: Date.now() - 7*86400000, isAdmin: false },
];

export default function AdminInvestorsPage() {
  const { user, demoMode } = useAuth();
  const [rows, setRows] = useState<InvestorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"vault" | "wallet" | "joined" | "plans">("vault");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demoMode || !user) {
        if (!cancelled) {
          setRows(mock);
          setLoading(false);
        }
        return;
      }
      const { db } = getFirebase();
      if (!db) {
        setRows(mock);
        setLoading(false);
        return;
      }
      try {
        const list = await listInvestors(db, 500);
        if (!cancelled) {
          setRows(list);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setRows(mock);
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, demoMode]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const matched = rows.filter(
      (r) =>
        !q ||
        r.name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q)
    );
    return [...matched].sort((a, b) => {
      switch (sortKey) {
        case "vault":
          return b.vault - a.vault;
        case "wallet":
          return b.wallet - a.wallet;
        case "plans":
          return b.activePlansCount - a.activePlansCount;
        case "joined":
        default:
          return b.joinedAt - a.joinedAt;
      }
    });
  }, [rows, query, sortKey]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <TopHeader title="Investors" subtitle={`${rows.length} accounts · sorted by ${sortKey}`} />

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
          {(["vault", "wallet", "plans", "joined"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={cn(
                "text-[10px] px-2.5 py-1.5 rounded-full transition capitalize",
                sortKey === k
                  ? "bg-vault/15 text-vault font-medium"
                  : "text-text-subtle hover:text-text"
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <button className="ml-auto text-[11px] px-3 py-1.5 bg-card border border-border rounded-full text-text-muted hover:text-text flex items-center gap-1.5">
          <Download className="w-3 h-3" /> Export CSV
        </button>
      </div>

      <Card>
        <CardHeader title={`All investors (${filtered.length})`} />
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px] table-fixed min-w-[640px]">
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead>
              <tr className="text-text-subtle text-left">
                <th className="font-normal py-2">Investor</th>
                <th className="font-normal py-2 text-right">Plans</th>
                <th className="font-normal py-2 text-right">Wallet</th>
                <th className="font-normal py-2 text-right">Vault</th>
                <th className="font-normal py-2">Joined</th>
                <th className="font-normal py-2 text-right">Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.uid} className="border-t border-border hover:bg-card-elev/50 transition">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue/15 text-blue text-[10px] font-medium flex items-center justify-center shrink-0">
                        {(u.name?.[0] ?? "?").toUpperCase()}
                        {(u.name?.split(" ")?.[1]?.[0] ?? "").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[11px] truncate">{u.name}</p>
                        <p className="m-0 text-[9px] text-text-subtle truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right font-mono">{u.activePlansCount}</td>
                  <td className="py-2 text-right font-mono">{formatPHP(u.wallet, { short: true })}</td>
                  <td className="py-2 text-right font-mono text-vault">{formatPHP(u.vault, { short: true })}</td>
                  <td className="py-2 text-text-muted text-[10px]">
                    {new Date(u.joinedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "2-digit" })}
                  </td>
                  <td className="py-2 text-right">
                    {u.isAdmin ? (
                      <span className="text-[9px] bg-vault/15 text-vault px-1.5 py-0.5 rounded-md">Admin</span>
                    ) : (
                      <span className="text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md">Investor</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <button className="text-text-subtle hover:text-text">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-text-subtle py-8">
                    No investors match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
