"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import {
  mockPlans,
  type Plan,
  VAULT_365_MULTIPLIER,
  calcReinvestmentVault,
} from "@/lib/mock-data";
import { ActivatePlanModal } from "./ActivatePlanModal";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { activatePlanFor } from "@/lib/userState";

type Mode = "single" | "monthly";

const presets = [500, 1000, 5000, 10000];

export function PlansCalculator() {
  const searchParams = useSearchParams();
  const prefillRaw = searchParams.get("prefill");
  const prefillAmount = prefillRaw ? Math.max(0, parseInt(prefillRaw, 10) || 0) : null;

  const [amount, setAmount] = useState(prefillAmount ?? 1000);
  const [mode, setMode] = useState<Mode>("single");
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const { user, demoMode } = useAuth();

  async function handleActivate(plan: Plan, capitalAmount: number) {
    if (demoMode || !user) return; // demo: show success animation only
    const { db } = getFirebase();
    if (!db) return;
    await activatePlanFor(db, user.uid, plan.id, plan.name, capitalAmount);
  }

  useEffect(() => {
    if (prefillAmount !== null) setAmount(prefillAmount);
  }, [prefillAmount]);

  return (
    <div>
      {prefillAmount !== null && (
        <div className="bg-gold/10 border border-border-gold rounded-xl p-3 mb-3 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
            <RefreshCw className="w-3.5 h-3.5 text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-medium m-0 text-text">
              Reinvesting <span className="font-mono text-gold">{formatPHP(prefillAmount)}</span> from your wallet
            </p>
            <p className="text-[10px] text-gold-muted m-0 mt-0.5">
              Pick a plan below — earnings will compound back into your vault.
            </p>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-card to-[#1F1A2C] border border-border-gold rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-gold-muted tracking-wider m-0">
                CALCULATOR — INVESTMENT AMOUNT
              </p>
              <div className="flex gap-1 bg-canvas/50 rounded-full p-0.5 border border-border">
                <button
                  onClick={() => setMode("single")}
                  className={cn(
                    "text-[10px] px-3 py-1 rounded-full transition",
                    mode === "single"
                      ? "bg-gold text-gold-dark font-medium"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  Single
                </button>
                <button
                  onClick={() => setMode("monthly")}
                  className={cn(
                    "text-[10px] px-3 py-1 rounded-full transition",
                    mode === "monthly"
                      ? "bg-gold text-gold-dark font-medium"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  Monthly reinvest
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 bg-canvas border border-border rounded-lg">
              <span className="text-[14px] text-text-subtle">₱</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 bg-transparent text-[18px] font-medium font-mono text-text outline-none"
              />
              <div className="flex gap-1">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(p)}
                    className={cn(
                      "text-[9px] px-2 py-1 rounded-full transition",
                      amount === p
                        ? "bg-gold/15 text-gold"
                        : "bg-white/5 text-text-muted hover:bg-white/10"
                    )}
                  >
                    ₱{p >= 1000 ? `${p / 1000}K` : p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] text-gold-muted tracking-wider m-0 mb-1">VAULT COMPOUNDS AT</p>
            <p className="text-[18px] font-medium font-mono text-gold m-0 leading-none">1% daily</p>
            <p className="text-[9px] text-text-subtle mt-1 m-0">≈37.78× over 365 days</p>
          </div>
        </div>
        {mode === "monthly" && (
          <p className="text-[10px] text-gold-muted mt-3 m-0">
            Reinvest mode: deposit this amount every 30 days for 12 months. After year 1, vault ≈{" "}
            <span className="text-gold font-medium font-mono">
              {formatPHP(calcReinvestmentVault(amount * 1.05, 12, 365), { short: true })}
            </span>
            {" "}+ wallet{" "}
            <span className="text-text font-medium font-mono">
              {formatPHP(12 * amount * 1.05, { short: true })}
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mockPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            amount={amount}
            mode={mode}
            onActivate={() => setActivePlan(plan)}
          />
        ))}
      </div>

      <ActivatePlanModal
        open={activePlan !== null}
        onClose={() => setActivePlan(null)}
        plan={activePlan}
        amount={amount}
        onSubmit={handleActivate}
      />
    </div>
  );
}

function PlanCard({
  plan,
  amount,
  mode,
  onActivate,
}: {
  plan: Plan;
  amount: number;
  mode: Mode;
  onActivate: () => void;
}) {
  const featured = plan.featured;

  const stats = useMemo(() => {
    const dailyIncome = amount * (plan.dailyRate / 100);
    const walletIncome = dailyIncome * plan.durationDays;
    const vaultCredit = walletIncome;
    const vaultAfter365 = vaultCredit * VAULT_365_MULTIPLIER;
    const total = walletIncome + vaultAfter365;
    return { dailyIncome, walletIncome, vaultCredit, vaultAfter365, total };
  }, [plan, amount]);

  const inRange = amount >= plan.minInvestment && amount <= plan.maxInvestment;

  return (
    <div
      className={cn(
        "rounded-xl p-4 relative",
        featured
          ? "bg-gradient-to-br from-card to-[#221B2E] border border-gold"
          : "bg-card border border-border"
      )}
    >
      {featured && (
        <span className="absolute -top-2 left-3.5 text-[9px] px-2 py-0.5 bg-gold text-gold-dark rounded-full font-medium tracking-wider">
          MOST POPULAR
        </span>
      )}
      <div className="flex justify-between items-start mb-2.5">
        <div>
          <p className={cn("text-[13px] font-medium m-0", featured ? "text-gold" : "text-text")}>
            {plan.name}
          </p>
          <p className={cn("text-[10px] mt-0.5 m-0", featured ? "text-gold-muted" : "text-text-subtle")}>
            {plan.durationDays} days · {formatPHP(plan.minInvestment, { short: true })} –{" "}
            {formatPHP(plan.maxInvestment, { short: true })}
          </p>
        </div>
        <span className="text-[18px] font-medium font-mono text-gold">
          {plan.dailyRate}%
        </span>
      </div>

      <div
        className={cn(
          "rounded-md p-2.5 mb-3",
          featured ? "bg-black/25" : "bg-canvas"
        )}
      >
        <p className="text-[9px] text-text-subtle tracking-wider m-0 mb-1.5">
          FOR {formatPHP(amount, { short: true })}
        </p>
        <Row label="Daily income" value={formatPHP(stats.dailyIncome)} />
        <Row label="Wallet income" value={formatPHP(stats.walletIncome, { short: true })} />
        <Row label="Vault credit" value={formatPHP(stats.vaultCredit, { short: true })} />
        <div className="border-t border-dashed border-gold/25 mt-1.5 pt-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[9px] text-gold-muted">Vault after 365d</span>
            <span className="text-[17px] font-mono text-gold font-medium">
              {formatPHP(stats.vaultAfter365, { short: true })}
            </span>
          </div>
          <div className="flex justify-between text-[9px] text-text-subtle mt-0.5">
            <span>Total return</span>
            <span className="font-mono text-text-muted">
              {formatPHP(stats.total, { short: true })}
            </span>
          </div>
        </div>
      </div>

      <button
        disabled={!inRange}
        onClick={onActivate}
        className={cn(
          "w-full py-2 rounded-md text-[11px] font-medium transition flex items-center justify-center gap-1.5",
          featured
            ? "bg-gold text-gold-dark hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            : "bg-transparent border border-gold/30 text-gold hover:bg-gold/5 disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        {inRange ? "Activate plan" : `Min ${formatPHP(plan.minInvestment, { short: true })}`}
        {inRange && <ArrowRight className="w-3 h-3" />}
      </button>

      {mode === "monthly" && inRange && (
        <p className="text-[9px] text-gold-muted text-center mt-2 m-0">
          1yr reinvest projection · vault ≈{" "}
          {formatPHP(calcReinvestmentVault(stats.vaultCredit, 12, 365), { short: true })}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px] py-0.5">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text">{value}</span>
    </div>
  );
}
