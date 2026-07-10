"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { collectionGroup, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";

type ReinvestRow = {
  id: string;
  userId: string;
  userName: string;
  title: string;
  subtitle: string;
  amount: number;
  at: number;
};

export default function AdminReinvestmentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReinvestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.isAdmin) return;
    const { db } = getFirebase();
    if (!db) return;

    (async () => {
      const q = query(
        collectionGroup(db, "activity"),
        where("type", "==", "reinvest"),
        orderBy("at", "desc")
      );
      const snap = await getDocs(q);
      const items: ReinvestRow[] = snap.docs.map((d) => {
        const data = d.data();
        const parentPath = d.ref.parent.path;
        const uid = parentPath.split("/")[1] ?? "";
        const at = data.at instanceof Timestamp ? data.at.toMillis() : (data.at ?? 0);
        return {
          id: d.id,
          userId: uid,
          userName: uid,
          title: data.title ?? "",
          subtitle: data.subtitle ?? "",
          amount: data.amount ?? 0,
          at,
        };
      });
      setRows(items);
      setLoading(false);
    })();
  }, [user]);

  // Resolve user names from the user docs
  useEffect(() => {
    if (!rows.length) return;
    const { db } = getFirebase();
    if (!db) return;
    const uids = [...new Set(rows.map((r) => r.userId))];

    (async () => {
      const { doc, getDoc } = await import("firebase/firestore");
      const nameMap: Record<string, string> = {};
      await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
              const data = snap.data();
              nameMap[uid] = data.profile?.name || data.profile?.email || uid.slice(0, 8);
            }
          } catch { /* skip */ }
        })
      );
      if (Object.keys(nameMap).length) {
        setRows((prev) =>
          prev.map((r) => ({ ...r, userName: nameMap[r.userId] || r.userName }))
        );
      }
    })();
  }, [rows.length]);

  const filtered = search
    ? rows.filter(
        (r) =>
          r.userName.toLowerCase().includes(search.toLowerCase()) ||
          r.title.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const totalReinvested = filtered.reduce((s, r) => s + r.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <TopHeader title="Reinvestments" subtitle={`${rows.length} total reinvestments`} />

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">TOTAL REINVESTED</p>
          <p className="text-[16px] font-mono font-medium m-0">{formatPHP(totalReinvested)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1">TRANSACTIONS</p>
          <p className="text-[16px] font-mono font-medium m-0">{filtered.length}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Reinvestment log"
          right={
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search investor…"
                className="bg-canvas border border-border rounded-md pl-8 pr-3 py-1.5 text-[11px] outline-none focus:border-gold/40 w-44"
              />
            </div>
          }
        />

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-[12px] text-text-muted">
            {rows.length === 0 ? "No reinvestments yet" : "No results match your search"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-3.5 h-3.5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium m-0 truncate">{r.userName}</p>
                  <p className="text-[10px] text-text-muted m-0 mt-0.5 truncate">{r.title}</p>
                  <p className="text-[10px] text-text-subtle m-0 mt-0.5">{r.subtitle}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-mono font-medium m-0">{formatPHP(r.amount)}</p>
                  <p className="text-[9px] text-text-subtle m-0 mt-0.5">
                    {r.at ? new Date(r.at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }) : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
