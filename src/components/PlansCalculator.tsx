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
  "starter-5": "Quick 5-day cycle to test the platform.",
  "growth-10": "Balanced 10-day plan — solid daily income.",
  "momentum-15": "Most popular. Stronger rate, larger vault seed.",
  "premium-30": "Highest daily rate over the longest cycle.",
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
    await activatePlanFor(
      db,
      user.uid,
      plan.id,
      plan.name,
      capitalAmount,
      plan.dailyRate,
      plan.durationDays,
      {
        referralEnabled: plan.referralEnabled,
        referralBonusType: plan.referralBonusType,
        referralBonusValue: plan.referralBonusValue,
        referralReleaseType: plan.referralReleaseType,
        clearingPeriodDays: plan.clearingPeriodDays,
      }
    );
  }

  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? plans[0],
    [plans, selectedId]
  );

  if (loading || !selected) {
    return (
      <div className="bg-card border border-border rounded-2xl flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const inRange = amount >= selected.minInvestment && amount <= selected.maxInvestment;
  const dailyIncome = amount * (selected.dailyRate / 100);
  const walletIncome = dailyIncome * selected.durationDays;
  const capitalReturn = amount;
  const vaultCredit = walletIncome;
  const vaultAfter365 = vaultCredit * VAULT_365_MULTIPLIER;
  const total = capitalReturn + walletIncome + vaultAfter365;
  const monthlyVault = calcReinvestmentVault(vaultCredit, 12, 365);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
      {/* Tabs row — plan chips (scroll on mobile) + Single/Monthly toggle,
          which drops below the chips on small screens so nothing crams. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {plans.map((p) => {
            const active = p.id === selected.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] transition shrink-0 whitespace-nowrap",
                  active
                    ? "bg-card-elev text-text font-medium"
                    : "text-text-muted hover:text-text"
                )}
              >
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full ring-2 transition shrink-0",
                    active ? "bg-green ring-green/30" : "bg-transparent ring-text-subtle/40"
                  )}
                />
                {p.name}
                {p.featured && <Sparkles className="w-2.5 h-2.5 text-gold shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 bg-canvas border border-border rounded-full p-0.5 shrink-0 self-start sm:self-auto">
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
            Monthly
          </button>
        </div>
      </div>

      {/* Hero — illustration + amount */}
      <div className="px-5 py-5 flex items-center gap-4 border-b border-border">
        <div className="shrink-0">
          <GrowthIllustration featured={selected.featured} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-text-subtle uppercase tracking-[0.18em] m-0 mb-1">
            Investment
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className="text-text-subtle leading-none"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "26px",
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
                fontSize: "clamp(28px, 4.5vw, 38px)",
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                letterSpacing: "-0.025em",
                lineHeight: "1",
              }}
              aria-label="Investment amount"
            />
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">
            {[500, 1000, 5000, 10000].map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full transition",
                  amount === p
                    ? "bg-gold/15 text-gold font-medium"
                    : "bg-card-elev text-text-muted hover:text-text"
                )}
              >
                ₱{p >= 1000 ? `${p / 1000}K` : p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Spec rows */}
      <div className="flex flex-col flex-1">
        <SpecRow label="Daily rate" value={`${selected.dailyRate}% / day`} index={0} />
        <SpecRow label="Duration" value={`${selected.durationDays} days`} index={1} />
        <SpecRow
          label="Range"
          value={`${formatPHP(selected.minInvestment, { short: true })} – ${formatPHP(selected.maxInvestment, { short: true })}`}
          index={2}
        />
        <SpecRow label="Vault lock" value="365 days · 1% daily" index={3} />

        <SectionHeader
          label={mode === "monthly" ? "Monthly reinvest · year 1" : `For ₱${amount.toLocaleString()}`}
        />

        {mode === "single" ? (
          <>
            <SpecRow label="Daily income" value={formatPHP(dailyIncome)} index={4} />
            <SpecRow label="Wallet income" value={formatPHP(walletIncome)} index={5} />
            <SpecRow label="Capital return" value={formatPHP(capitalReturn)} index={6} />
            <SpecRow label="Vault credit" value={formatPHP(vaultCredit)} index={7} vault />
            <SpecRow
              label="Vault after 365d"
              value={formatPHP(vaultAfter365, { short: true })}
              index={8}
              vault
              bigValue
            />
            <SpecRow
              label="Total return"
              value={formatPHP(total, { short: true })}
              index={9}
              highlight
              bigValue
            />
          </>
        ) : (
          <>
            <SpecRow label="Per cycle wallet" value={formatPHP(walletIncome)} index={4} />
            <SpecRow label="Per cycle vault" value={formatPHP(vaultCredit)} index={5} vault />
            <SpecRow
              label="Wallet · 12 cycles"
              value={formatPHP(walletIncome * 12, { short: true })}
              index={6}
            />
            <SpecRow
              label="Capital returned (12×)"
              value={formatPHP(capitalReturn * 12, { short: true })}
              index={7}
            />
            <SpecRow
              label="Vault · year end"
              value={formatPHP(monthlyVault, { short: true })}
              index={8}
              vault
              bigValue
            />
            <SpecRow
              label="Total year 1"
              value={formatPHP(walletIncome * 12 + capitalReturn * 12 + monthlyVault, { short: true })}
              index={9}
              highlight
              bigValue
            />
          </>
        )}
      </div>

      {/* Tagline + CTA footer */}
      <div className="p-4 border-t border-border">
        <p className="text-[11px] text-text-muted m-0 mb-3 leading-relaxed">
          {planTaglines[selected.id] ??
            `${selected.durationDays}-day plan paying ${selected.dailyRate}% daily. Earnings auto-credit to your vault.`}
        </p>
        <button
          onClick={() => setActivatePlan(selected)}
          disabled={!inRange}
          className={cn(
            "w-full py-3 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition",
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
        "flex items-center justify-between gap-3 px-5 py-2.5 transition",
        alt ? "bg-card-elev/40" : "bg-transparent",
        highlight && "bg-gold/5"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            vault ? "bg-vault" : highlight ? "bg-gold" : "bg-green/70"
          )}
        />
        <span
          className={cn(
            "text-[11px] truncate",
            vault ? "text-vault-muted" : highlight ? "text-gold-muted" : "text-text-muted"
          )}
        >
          {label}
        </span>
      </div>
      <span
        className={cn(
          "font-mono tabular-nums shrink-0",
          bigValue ? "text-[14px] font-medium" : "text-[12px]",
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
    <div className="px-5 py-2 bg-card-elev/60 border-y border-border">
      <p className="text-[9px] uppercase tracking-[0.18em] text-text-subtle m-0">{label}</p>
    </div>
  );
}

function GrowthIllustration({ featured }: { featured?: boolean }) {
  return (
    <svg viewBox="0 0 140 100" className="w-[120px] h-[86px]" aria-hidden>
      <defs>
        <linearGradient id="growth-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3DD598" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3DD598" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="growth-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DD598" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3DD598" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="0.5">
        <line x1="0" y1="30" x2="140" y2="30" />
        <line x1="0" y1="60" x2="140" y2="60" />
      </g>
      <path
        d="M 8 85 Q 35 80, 50 65 T 95 38 Q 110 28, 128 14 L 128 92 L 8 92 Z"
        fill="url(#growth-fade)"
      />
      <path
        d="M 8 85 Q 35 80, 50 65 T 95 38 Q 110 28, 128 14"
        stroke="url(#growth-grad)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 124 10 L 132 17 L 126 24"
        stroke="#3DD598"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="85" r="2.5" fill="#3DD598" />
      <circle cx="50" cy="65" r="2.5" fill="#3DD598" />
      <circle cx="95" cy="38" r="2.5" fill="#3DD598" />
      <circle cx="128" cy="14" r="4" fill="#3DD598">
        <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
      </circle>
      {featured && (
        <g transform="translate(20 28)">
          <circle r="11" fill="#A78BFA" fillOpacity="0.18" />
          <circle r="7" fill="#A78BFA" fillOpacity="0.7" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize="8"
            fontWeight="600"
          >
            ★
          </text>
        </g>
      )}
    </svg>
  );
}
