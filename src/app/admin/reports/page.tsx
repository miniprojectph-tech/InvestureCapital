"use client";

import { Download, FileText, BarChart3, Users, Lock } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card } from "@/components/Card";

const reports = [
  {
    title: "Investor roster",
    desc: "All accounts with current wallet, vault, active plans, and joined date.",
    icon: Users,
    iconTone: "bg-blue/15 text-blue",
    size: "12.4 KB",
  },
  {
    title: "Vault snapshot",
    desc: "Per-investor vault balance, projected 365d value, and daily accrual.",
    icon: Lock,
    iconTone: "bg-vault/15 text-vault",
    size: "8.1 KB",
  },
  {
    title: "Capital flow",
    desc: "Daily aggregated deposits, payouts, and withdrawals for the last 90 days.",
    icon: BarChart3,
    iconTone: "bg-green/15 text-green",
    size: "24.7 KB",
  },
  {
    title: "Plan performance",
    desc: "Activation count, capital deployed, and total wallet payouts per plan template.",
    icon: FileText,
    iconTone: "bg-gold/15 text-gold",
    size: "6.2 KB",
  },
];

export default function AdminReportsPage() {
  return (
    <div>
      <TopHeader title="Reports" subtitle="Downloadable CSV snapshots for accounting + ops" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.title} className="lift">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${r.iconTone}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium m-0">{r.title}</p>
                  <p className="text-[11px] text-text-muted mt-1 m-0 leading-relaxed">{r.desc}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <button className="text-[11px] px-3 py-1.5 bg-gold/15 text-gold rounded-md font-medium flex items-center gap-1.5 hover:bg-gold/25 transition">
                      <Download className="w-3 h-3" /> Download CSV
                    </button>
                    <span className="text-[10px] text-text-subtle">{r.size}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-[10px] text-text-subtle text-center mt-6 m-0">
        Reports are generated on demand from Firestore. CSV download wiring coming next.
      </p>
    </div>
  );
}
