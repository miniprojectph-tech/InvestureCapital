"use client";

import { Users, ArrowDownRight, Coins, Clock } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { formatPHP } from "@/lib/utils";

const flowData = Array.from({ length: 30 }, (_, i) => ({
  day: i,
  in: 120 + i * 8 + Math.random() * 30,
  out: 60 + i * 3 + Math.random() * 18,
}));

const pendingWithdrawals = [
  { name: "Theresa Webb", initials: "TW", amount: 2450, type: "Short-term", time: "12 min ago" },
  { name: "Jerome Bell", initials: "JB", amount: 18400, type: "Long-term", time: "38 min ago · day 412" },
  { name: "Arlene McCoy", initials: "AM", amount: 680, type: "Short-term", time: "1h ago" },
];

const investors = [
  { initials: "TW", name: "Theresa Webb", email: "theresa@mail.com", plans: 3, wallet: 250, vault: 9445, status: "Active" },
  { initials: "AM", name: "Arlene McCoy", email: "arlene@mail.com", plans: 2, wallet: 120, vault: 3200, status: "Active" },
  { initials: "JB", name: "Jerome Bell", email: "jerome@mail.com", plans: 5, wallet: 890, vault: 24180, status: "Active" },
  { initials: "RE", name: "Ralph Edwards", email: "ralph@mail.com", plans: 0, wallet: 0, vault: 0, status: "Pending" },
];

export default function AdminDashboard() {
  return (
    <div>
      <TopHeader title="Admin overview" subtitle="Last refreshed 2 minutes ago" />

      <div className="grid grid-cols-4 gap-2 mb-3">
        <KpiCard label="Total investors" value="1,284" sub="+12.4%" subTone="green" icon={Users} iconTone="blue" />
        <KpiCard label="Capital in" value="₱4.82M" sub="+8.1%" subTone="green" icon={ArrowDownRight} iconTone="green" />
        <KpiCard label="Daily payouts" value="₱124.5K" sub="+3.2%" subTone="green" icon={Coins} iconTone="gold" />
        <KpiCard label="Pending withdrawals" value="₱48.2K" sub="7 new" subTone="red" icon={Clock} iconTone="red" />
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-3 mb-3">
        <Card>
          <CardHeader
            title="Capital flow"
            right={
              <div className="flex gap-1">
                <span className="text-[10px] px-2 py-0.5 bg-gold/15 text-gold rounded-full font-medium">1M</span>
                <span className="text-[10px] px-2 py-0.5 text-text-subtle">6M</span>
                <span className="text-[10px] px-2 py-0.5 text-text-subtle">1Y</span>
              </div>
            }
          />
          <div className="flex gap-3 text-[10px] mb-2">
            <span className="text-text-subtle">
              <span className="inline-block w-2 h-0.5 bg-green mr-1 align-middle" />In
            </span>
            <span className="text-text-subtle">
              <span className="inline-block w-2 h-0.5 bg-red mr-1 align-middle" />Out
            </span>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={flowData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <Area type="monotone" dataKey="in" stroke="#22C55E" strokeWidth={1.5} fill="#22C55E" fillOpacity={0.1} />
                <Area type="monotone" dataKey="out" stroke="#EF4444" strokeWidth={1.5} fill="#EF4444" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-medium m-0 mb-1">This month</p>
          <p className="text-[10px] text-green m-0 mb-3">+43% vs last month</p>
          <div className="flex flex-col gap-2">
            <Stat label="Total invested" value="₱935K" />
            <Stat label="Returns paid" value="₱246K" />
            <Stat label="Vault activated" value="₱246K" />
            <Stat label="New plans" value="342" />
          </div>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader
          title="Needs attention — pending withdrawals"
          right={<span className="text-[10px] text-gold">View all (7)</span>}
        />
        {pendingWithdrawals.map((w, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 py-1.5 ${i < pendingWithdrawals.length - 1 ? "border-b border-border" : ""}`}
          >
            <div className="w-[22px] h-[22px] rounded-full bg-card-elev text-[9px] font-medium flex items-center justify-center shrink-0">
              {w.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] m-0">{w.name}</p>
              <p className="text-[9px] text-text-subtle mt-0.5 m-0">{w.type} · {w.time}</p>
            </div>
            <span className="text-[11px] font-medium font-mono">{formatPHP(w.amount, { short: true })}</span>
            <button className="text-[10px] px-2.5 py-1 bg-green/15 text-green rounded-md">Approve</button>
            <button className="text-[10px] px-2.5 py-1 text-text-muted hover:bg-card-elev rounded-md">Reject</button>
          </div>
        ))}
      </Card>

      <Card>
        <CardHeader
          title="Latest investors"
          right={<span className="text-[10px] text-gold">View all</span>}
        />
        <table className="w-full text-[11px] table-fixed">
          <thead>
            <tr className="text-text-subtle text-left">
              <th className="font-normal py-1" style={{ width: "32%" }}>Investor</th>
              <th className="font-normal py-1 text-right" style={{ width: "12%" }}>Plans</th>
              <th className="font-normal py-1 text-right" style={{ width: "18%" }}>Wallet</th>
              <th className="font-normal py-1 text-right" style={{ width: "18%" }}>Vault</th>
              <th className="font-normal py-1 text-right" style={{ width: "12%" }}>Status</th>
              <th className="font-normal py-1" style={{ width: "8%" }}></th>
            </tr>
          </thead>
          <tbody>
            {investors.map((u, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-[22px] h-[22px] rounded-full bg-blue/15 text-blue text-[9px] font-medium flex items-center justify-center shrink-0">
                      {u.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="m-0 text-[11px] truncate">{u.name}</p>
                      <p className="m-0 text-[9px] text-text-subtle truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right font-mono">{u.plans}</td>
                <td className="py-2 text-right font-mono">{formatPHP(u.wallet, { short: true })}</td>
                <td className="py-2 text-right font-mono">{formatPHP(u.vault, { short: true })}</td>
                <td className="py-2 text-right">
                  <span
                    className={
                      u.status === "Active"
                        ? "text-[9px] bg-green/15 text-green px-1.5 py-0.5 rounded-md"
                        : "text-[9px] bg-gold/15 text-gold px-1.5 py-0.5 rounded-md"
                    }
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-2 text-center text-text-subtle">⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-text-subtle">{label}</span>
      <span className="text-[12px] font-mono font-medium">{value}</span>
    </div>
  );
}
