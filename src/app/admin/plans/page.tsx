"use client";

import { useState } from "react";
import { Plus, Edit3, Trash2, ToggleLeft, ToggleRight, Coins } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { mockPlans, VAULT_365_MULTIPLIER, type Plan } from "@/lib/mock-data";

type EditablePlan = Plan & { active: boolean };

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<EditablePlan[]>(
    mockPlans.map((p) => ({ ...p, active: true }))
  );

  function toggle(id: string) {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))
    );
  }

  return (
    <div>
      <TopHeader title="Plan templates" subtitle="Create, edit, and activate plans investors can buy" />

      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-text-muted m-0">
          {plans.filter((p) => p.active).length} of {plans.length} active
        </p>
        <button className="text-[12px] px-3.5 py-2 bg-gold text-gold-dark rounded-lg font-medium flex items-center gap-1.5 hover:brightness-110 transition">
          <Plus className="w-3.5 h-3.5" /> New plan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {plans.map((p) => {
          const sampleAmount = 1000;
          const dailyIncome = sampleAmount * (p.dailyRate / 100);
          const total = dailyIncome * p.durationDays;
          const vault365 = total * VAULT_365_MULTIPLIER;

          return (
            <Card key={p.id} className={cn("flex flex-col", !p.active && "opacity-60")}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium m-0">{p.name}</p>
                    <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                      {p.durationDays} days · {p.dailyRate}% / day
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "transition",
                    p.active ? "text-green" : "text-text-subtle hover:text-text"
                  )}
                  aria-label={p.active ? "Deactivate" : "Activate"}
                >
                  {p.active ? (
                    <ToggleRight className="w-7 h-7" strokeWidth={1.8} />
                  ) : (
                    <ToggleLeft className="w-7 h-7" strokeWidth={1.8} />
                  )}
                </button>
              </div>

              <div className="bg-canvas rounded-md p-3 mb-3">
                <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0 mb-1.5">
                  Sample · ₱1,000 investment
                </p>
                <Row label="Daily income" value={formatPHP(dailyIncome)} />
                <Row label="Wallet total" value={formatPHP(total)} />
                <div className="border-t border-dashed border-vault/25 mt-1.5 pt-1.5">
                  <Row label="Vault after 365d" value={formatPHP(vault365, { short: true })} vault />
                </div>
              </div>

              <div className="flex flex-col gap-2 text-[10px] text-text-muted mb-3">
                <RowSmall label="Min investment" value={formatPHP(p.minInvestment)} />
                <RowSmall label="Max investment" value={formatPHP(p.maxInvestment)} />
                <RowSmall label="Featured" value={p.featured ? "Yes" : "No"} />
                <RowSmall label="Status" value={p.active ? "Active" : "Inactive"} valueColor={p.active ? "text-green" : "text-text-subtle"} />
              </div>

              <div className="flex gap-2 mt-auto">
                <button className="flex-1 text-[11px] py-2 bg-card-elev border border-border-strong rounded-md text-text-muted hover:text-text flex items-center justify-center gap-1.5">
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
                <button className="text-[11px] px-3 py-2 bg-card-elev border border-border-strong rounded-md text-red hover:bg-red/10">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </Card>
          );
        })}

        {/* "Create new" card */}
        <button className="border-2 border-dashed border-border-strong rounded-xl flex flex-col items-center justify-center py-12 hover:border-border-gold transition text-text-subtle hover:text-gold">
          <Plus className="w-8 h-8 mb-2" strokeWidth={1.5} />
          <span className="text-[12px] font-medium">New plan template</span>
        </button>
      </div>

      <Card>
        <CardHeader
          title="Plan formula"
          subtitle="Daily income = capital × daily rate · Vault credit = total income · Vault compounds 1% daily"
        />
        <pre className="bg-canvas border border-border rounded-md p-3 text-[10px] font-mono text-text-muted overflow-x-auto m-0">
{`daily_income     = capital × daily_rate
wallet_total     = daily_income × duration_days
vault_credit     = wallet_total            // on plan completion
vault_after_365d = vault_credit × (1.01)^365  ≈  vault_credit × 37.78
total_return     = wallet_total + vault_after_365d`}
        </pre>
      </Card>
    </div>
  );
}

function Row({ label, value, vault }: { label: string; value: string; vault?: boolean }) {
  return (
    <div className={cn("flex justify-between text-[10px] py-0.5", vault ? "text-vault-muted" : "text-text-muted")}>
      <span>{label}</span>
      <span className={cn("font-mono", vault ? "text-vault font-medium" : "text-text")}>{value}</span>
    </div>
  );
}

function RowSmall({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={cn("font-mono", valueColor ?? "text-text")}>{value}</span>
    </div>
  );
}
