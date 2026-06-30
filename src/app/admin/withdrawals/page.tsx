"use client";

import { useState } from "react";
import { Check, X, Clock, AlertCircle } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";

type Status = "pending" | "approved" | "rejected";
type WRow = {
  id: string;
  name: string;
  initials: string;
  email: string;
  amount: number;
  type: "Short-term" | "Long-term";
  status: Status;
  at: number;
  note?: string;
};

const seed: WRow[] = [
  { id: "w1", name: "Theresa Webb", initials: "TW", email: "theresa@mail.com", amount: 2450, type: "Short-term", status: "pending", at: Date.now() - 12*60*1000 },
  { id: "w2", name: "Jerome Bell", initials: "JB", email: "jerome@mail.com", amount: 18400, type: "Long-term", status: "pending", at: Date.now() - 38*60*1000, note: "Day 412 · lock cleared" },
  { id: "w3", name: "Arlene McCoy", initials: "AM", email: "arlene@mail.com", amount: 680, type: "Short-term", status: "pending", at: Date.now() - 60*60*1000 },
  { id: "w4", name: "Devon Lane", initials: "DL", email: "devon@mail.com", amount: 1200, type: "Short-term", status: "approved", at: Date.now() - 3*86400000 },
  { id: "w5", name: "Kristin Watson", initials: "KW", email: "kristin@mail.com", amount: 95, type: "Short-term", status: "rejected", at: Date.now() - 4*86400000, note: "Bank account mismatch" },
];

const statusMeta = {
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  approved: { label: "Approved", icon: Check, color: "text-green", bg: "bg-green/15" },
  rejected: { label: "Rejected", icon: X, color: "text-red", bg: "bg-red/15" },
};

export default function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<WRow[]>(seed);
  const [tab, setTab] = useState<Status>("pending");

  const filtered = rows.filter((r) => r.status === tab);
  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  function setStatus(id: string, status: Status) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, at: Date.now() } : r)));
  }

  return (
    <div>
      <TopHeader
        title="Withdrawal queue"
        subtitle={`${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`}
      />

      <div className="grid grid-cols-3 gap-2 mb-3">
        {(["pending", "approved", "rejected"] as Status[]).map((k) => {
          const meta = statusMeta[k];
          const Icon = meta.icon;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "bg-card border rounded-xl p-3 text-left transition relative overflow-hidden",
                tab === k ? "border-border-vault" : "border-border hover:border-border-strong"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-border-vault to-transparent",
                  tab === k ? "opacity-90" : "opacity-30"
                )}
              />
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn("w-7 h-7 rounded-md flex items-center justify-center", meta.bg)}>
                  <Icon className={cn("w-3.5 h-3.5", meta.color)} />
                </span>
                <span className={cn("text-[18px] font-mono font-medium", meta.color)}>{counts[k]}</span>
              </div>
              <p className="text-[11px] m-0 text-text">{meta.label}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={`${statusMeta[tab].label} withdrawals`}
          right={
            tab === "pending" && counts.pending > 0 ? (
              <span className="text-[10px] text-vault flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Action needed
              </span>
            ) : undefined
          }
        />

        {filtered.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">
            Nothing in this tab right now.
          </p>
        ) : (
          filtered.map((r, i) => (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-3 py-3",
                i < filtered.length - 1 && "border-b border-border"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-card-elev text-[10px] font-medium flex items-center justify-center shrink-0">
                {r.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">{r.name}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">
                  {r.email} · {r.type}
                  {r.note && <span className="text-vault-muted ml-1">· {r.note}</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-medium font-mono m-0">{formatPHP(r.amount)}</p>
                <p className="text-[9px] text-text-subtle m-0 mt-0.5">
                  {timeAgo(r.at)}
                </p>
              </div>
              {tab === "pending" ? (
                <div className="flex gap-1.5 ml-auto sm:ml-0">
                  <button
                    onClick={() => setStatus(r.id, "approved")}
                    className="text-[11px] px-3 py-1.5 bg-green/15 text-green rounded-md flex items-center gap-1.5 hover:bg-green/25 transition"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button
                    onClick={() => setStatus(r.id, "rejected")}
                    className="text-[11px] px-3 py-1.5 bg-card-elev border border-border-strong text-text-muted rounded-md hover:text-red hover:border-red/30 transition flex items-center gap-1.5"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              ) : (
                <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-medium", statusMeta[r.status].bg, statusMeta[r.status].color)}>
                  {statusMeta[r.status].label}
                </span>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
