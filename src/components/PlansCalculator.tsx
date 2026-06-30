"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import {
  type Plan,
  VAULT_365_MULTIPLIER,
  calcReinvestmentVault,
} from "@/lib/mock-data";
import { ActivatePlanModal } from "./ActivatePlanModal";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { activatePlanFor } from "@/lib/userState";
import { usePlans } from "@/lib/plans";

type Mode = "single" | "monthly";

const planTaglines: Record<string, string> = {
  "starter-5": "Quick 5-day cycle to test the platform and seed your vault for the first time.",
  "growth-10": "Balanced 10-day plan — solid daily income, meaningful vault seed.",
  "momentum-15": "Our most popular plan. Stronger daily rate, larger vault credit.",
  "premium-30": "Highest daily rate over the longest cycle. Maximum vault payoff.",
};

export function PlansCalculator() {
  const searchParams = useSearchParams();
  const prefillRaw = searchParams.get("prefill");
  const prefillAmount = prefillRaw ? Math.max(0, parseInt(prefillRaw, 10) || 0) : null;

  const { plans, loading } = usePlans({ onlyActive: true });
  const [amount, setAmount] = useState(prefillAmount ?? 1000);
  const [mode, setMode] = useState<Mode>("single");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activatePlan, setActivatePlan] = useState<Plan | null>(null);
  const { user, demoMode } = useAuth();

  // Default-select the featured plan, falling back to the first active one
  useEffect(() => {
    if (selectedId !== null) return;
    if (plans.length === 0) return;
    const featured = plans.find((p) => p.featured);
    setSelectedId(featured?.id ?? plans[0].id);
  }, [plans, selectedId]);

  useEffect(() => {
    if (prefillAmount !== null) setAmount(prefillAmount);
  }, [prefillAmount]);

  async function handleActivate(plan: Plan, capitalAmount: number) {
    if (demoMode || !user) return;
    const { db } = getFirebase();
    if (!db) return;
    await activatePlanFor(db, user.uid, plan.id, plan.name, capitalAmount);
  }

  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? plans[0],
    [plans, selectedId]
  );

  if (loading || !selected) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const inRange = amount >= selected.minInvestment && amount <= selected.maxInvestment;
  const dailyIncome = amount * (selected.dailyRate / 100);
  const walletIncome = dailyIncome * selected.durationDays;
  const vaultCredit = walletIncome;
  const vaultAfter365 = vaultCredit * VAULT_365_MULTIPLIER;
  const total = walletIncome + vaultAfter365;
  const monthlyVault = calcReinvestmentVault(vaultCredit, 12, 365);

  return (
    <div>
      {prefillAmount !== null && (
        <div className="bg-gold/10 border border-border-gold rounded-xl p-3 mb-4 flex items-center gap-2.5">
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

      {/* Plan selector tabs — Fxvibe radio-pill style */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border overflow-x-auto whitespace-nowrap">
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
            {plans.map((p) => {
              const active = p.id === selected.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] transition shrink-0",
                    active
                      ? "bg-card-elev text-text font-medium"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  <span
                    className={cn(
                      "w-3 h-3 rounded-full ring-2 transition",
                      active ? "bg-green ring-green/30" : "bg-transparent ring-text-subtle/40"
                    )}
                  />
                  {p.name}
                  {p.featured && (
                    <Sparkles className="w-3 h-3 text-gold ml-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-canvas border border-border rounded-full p-0.5 shrink-0">
            <button
              onClick={() => setMode("single")}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-full transition",
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
                "text-[10px] px-2.5 py-1 rounded-full transition",
                mode === "monthly"
                  ? "bg-gold text-gold-dark font-medium"
                  : "text-text-muted hover:text-text"
              )}
            >
              Monthly reinvest
            </button>
          </div>
        </div>

        {/* Main card body — LEFT personality / RIGHT specs */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
          {/* LEFT */}
          <div className="p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-border flex flex-col">
            <div className="mb-4">
              <GrowthIllustration featured={selected.featured} />
            </div>

            <p className="text-[10px] text-text-subtle uppercase tracking-[0.18em] m-0 mb-2">
              Investment amount
            </p>
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className="text-text-subtle leading-none"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "36px",
                  fontVariationSettings: '"opsz" 144, "SOFT" 30',
                }}
              >
                ₱
              </span>
              <input
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="bg-transparent border-none outline-none w-full text-text font-medium tracking-tight tabular-nums"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(36px, 6vw, 56px)",
                  fontVariationSettings: '"opsz" 144, "SOFT" 30',
                  letterSpacing: "-0.025em",
                  lineHeight: "1",
                }}
                aria-label="Investment amount"
              />
            </div>
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {[500, 1000, 5000, 10000].map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={cn(
                    "text-[10px] px-2.5 py-1 rounded-full transition",
                    amount === p
                      ? "bg-gold/15 text-gold font-medium"
                      : "bg-card-elev text-text-muted hover:text-text"
                  )}
                >
                  ₱{p >= 1000 ? `${p / 1000}K` : p}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-text-muted leading-relaxed m-0 mb-5">
              {planTaglines[selected.id] ??
                `${selected.durationDays}-day plan paying ${selected.dailyRate}% daily. Earnings auto-credit to your Future Growth Vault on completion.`}
            </p>

            <button
              onClick={() => setActivatePlan(selected)}
              disabled={!inRange}
              className={cn(
                "mt-auto w-full py-3 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition",
                inRange
                  ? "bg-gold text-gold-dark hover:brightness-110"
                  : "bg-card-elev text-text-subtle cursor-not-allowed"
              )}
            >
              {inRange ? (
                <>
                  Activate {selected.name} <ArrowRight className="w-4 h-4" />
                </>
              ) : amount < selected.minInvestment ? (
                `Minimum ${formatPHP(selected.minInvestment, { short: true })}`
              ) : (
                `Maximum ${formatPHP(selected.maxInvestment, { short: true })}`
              )}
            </button>
          </div>

          {/* RIGHT — spec rows */}
          <div className="flex flex-col">
            <SpecRow label="Daily rate" value={`${selected.dailyRate}% / day`} index={0} />
            <SpecRow label="Duration" value={`${selected.durationDays} days`} index={1} />
            <SpecRow label="Min investment" value={formatPHP(selected.minInvestment)} index={2} />
            <SpecRow label="Max investment" value={formatPHP(selected.maxInvestment)} index={3} />
            <SpecRow label="Vault compound" value="1.0% daily" index={4} />
            <SpecRow label="Vault lock" value="365 days" index={5} />

            <SectionHeader label={mode === "monthly" ? "Monthly reinvest projection" : `For ₱${amount.toLocaleString()}`} />

            {mode === "single" ? (
              <>
                <SpecRow label="Daily income" value={formatPHP(dailyIncome)} index={6} />
                <SpecRow label="Wallet income" value={formatPHP(walletIncome)} index={7} />
                <SpecRow label="Vault credit" value={formatPHP(vaultCredit)} index={8} vault />
                <SpecRow
                  label="Vault after 365d"
                  value={formatPHP(vaultAfter365, { short: true })}
                  index={9}
                  vault
                  bigValue
                />
                <SpecRow
                  label="Total return"
                  value={formatPHP(total, { short: true })}
                  index={10}
                  highlight
                  bigValue
                />
              </>
            ) : (
              <>
                <SpecRow label="Per cycle wallet income" value={formatPHP(walletIncome)} index={6} />
                <SpecRow label="Per cycle vault credit" value={formatPHP(vaultCredit)} index={7} vault />
                <SpecRow
                  label="Wallet after 12 cycles"
                  value={formatPHP(walletIncome * 12, { short: true })}
                  index={8}
                />
                <SpecRow
                  label="Vault after year 1"
                  value={formatPHP(monthlyVault, { short: true })}
                  index={9}
                  vault
                  bigValue
                />
                <SpecRow
                  label="Total year 1"
                  value={formatPHP(walletIncome * 12 + monthlyVault, { short: true })}
                  index={10}
                  highlight
                  bigValue
                />
              </>
            )}
          </div>
        </div>
      </div>

      <ActivatePlanModal
        open={activatePlan !== null}
        onClose={() => setActivatePlan(null)}
        plan={activatePlan}
        amount={amount}
        onSubmit={handleActivate}
      />
    </div>
  );
}

function SpecRow({
  label,
  value,
  index,
  vault,
  highlight,
  bigValue,
}: {
  label: string;
  value: string;
  index: number;
  vault?: boolean;
  highlight?: boolean;
  bigValue?: boolean;
}) {
  const alt = index % 2 === 1;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-3 transition",
        alt ? "bg-card-elev/40" : "bg-transparent",
        highlight && "bg-gold/5"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            vault ? "bg-vault" : highlight ? "bg-gold" : "bg-green/70"
          )}
        />
        <span
          className={cn(
            "text-[12px] truncate",
            vault ? "text-vault-muted" : highlight ? "text-gold-muted" : "text-text-muted"
          )}
        >
          {label}
        </span>
      </div>
      <span
        className={cn(
          "font-mono tabular-nums shrink-0",
          bigValue ? "text-[16px] font-medium" : "text-[13px]",
          vault ? "text-vault" : highlight ? "text-gold" : "text-text"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-2.5 bg-card-elev/60 border-y border-border">
      <p className="text-[9px] uppercase tracking-[0.18em] text-text-subtle m-0">{label}</p>
    </div>
  );
}

function GrowthIllustration({ featured }: { featured?: boolean }) {
  return (
    <svg viewBox="0 0 200 130" className="w-full max-w-[200px]" aria-hidden>
      <defs>
        <linearGradient id="growth-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3DD598" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3DD598" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="growth-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DD598" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3DD598" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Subtle grid */}
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.5">
        <line x1="0" y1="30" x2="200" y2="30" />
        <line x1="0" y1="60" x2="200" y2="60" />
        <line x1="0" y1="90" x2="200" y2="90" />
      </g>

      {/* Filled area under curve */}
      <path
        d="M 10 110 Q 50 100, 70 85 T 130 50 Q 150 35, 180 20 L 180 120 L 10 120 Z"
        fill="url(#growth-fade)"
      />

      {/* Main curve */}
      <path
        d="M 10 110 Q 50 100, 70 85 T 130 50 Q 150 35, 180 20"
        stroke="url(#growth-grad)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Arrow head */}
      <path
        d="M 175 15 L 185 22 L 178 30"
        stroke="#3DD598"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data dots */}
      <circle cx="10" cy="110" r="3" fill="#3DD598" />
      <circle cx="70" cy="85" r="3" fill="#3DD598" />
      <circle cx="130" cy="50" r="3" fill="#3DD598" />
      <circle cx="180" cy="20" r="5" fill="#3DD598">
        <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Vault badge for featured */}
      {featured && (
        <g transform="translate(20 35)">
          <circle r="14" fill="#A78BFA" fillOpacity="0.18" />
          <circle r="9" fill="#A78BFA" fillOpacity="0.6" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize="9"
            fontWeight="600"
            fontFamily="ui-monospace, monospace"
          >
            ★
          </text>
        </g>
      )}
    </svg>
  );
}
