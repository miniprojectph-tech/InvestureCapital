"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { formatPHP, cn } from "@/lib/utils";
import { type Plan, VAULT_365_MULTIPLIER } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  amount: number;
  onSubmit?: (plan: Plan, amount: number) => Promise<void>;
};

type Stage = "form" | "processing" | "success" | "error";

export function ActivatePlanModal({ open, onClose, plan, amount, onSubmit }: Props) {
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  function close() {
    onClose();
    setTimeout(() => {
      setStage("form");
      setError(null);
    }, 250);
  }

  async function confirm() {
    if (!plan) return;
    setStage("processing");
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(plan, amount);
      } else {
        await new Promise((r) => setTimeout(r, 1200));
      }
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
      setStage("error");
    }
  }

  if (!plan) return null;

  const dailyIncome = amount * (plan.dailyRate / 100);
  const walletIncome = dailyIncome * plan.durationDays;
  const capitalReturn = amount;
  const vaultCredit = walletIncome;
  const after365 = vaultCredit * VAULT_365_MULTIPLIER;
  const total = capitalReturn + walletIncome + after365;

  return (
    <Modal open={open} onClose={close} title={`Activate — ${plan.name}`}>
      {stage === "form" && (
        <div className="flex flex-col gap-4">
          <div className="bg-canvas rounded-lg p-3 border border-border">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Investment</span>
              <span className="text-[11px] text-text-muted">
                {plan.durationDays}d · {plan.dailyRate}%/day
              </span>
            </div>
            <p className="text-[24px] font-medium font-mono m-0">{formatPHP(amount)}</p>
          </div>

          <div className="bg-canvas rounded-lg p-3 border border-border">
            <p className="text-[10px] text-text-muted uppercase tracking-wider m-0 mb-2">What you&apos;ll earn</p>
            <div className="flex flex-col gap-1.5">
              <Row label="Daily income to wallet" value={formatPHP(dailyIncome)} />
              <Row label={`Total wallet income (${plan.durationDays}d)`} value={formatPHP(walletIncome)} />
              <Row label="Capital return at plan end" value={formatPHP(capitalReturn)} />
              <Row label="Vault credit at plan end" value={formatPHP(vaultCredit)} />
              <div className="border-t border-dashed border-gold/25 mt-1.5 pt-1.5">
                <Row label="Vault after 365d (1% daily)" value={formatPHP(after365)} gold />
                <div className="flex justify-between text-[11px] mt-1">
                  <span className="text-gold-muted">Total return</span>
                  <span className="font-mono font-medium text-gold">{formatPHP(total)}</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-text-subtle m-0">
            By activating, {formatPHP(amount)} will be deployed for {plan.durationDays} days.
            Daily payouts go to your wallet, your capital returns when the plan ends, and total
            earnings auto-credit to your Future Growth Vault.
          </p>

          <div className="flex gap-2">
            <button
              onClick={close}
              className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              className="flex-1 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 hover:brightness-110 transition"
            >
              Confirm activation <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {stage === "processing" && (
        <div className="py-8 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-gold animate-spin" />
          <p className="text-[12px] text-text-muted m-0">Activating plan…</p>
        </div>
      )}

      {stage === "success" && (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Plan activated</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">
              {plan.name} · {formatPHP(amount)} · payouts start tomorrow
            </p>
          </div>
          <button
            onClick={close}
            className="mt-2 px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium"
          >
            Done
          </button>
        </div>
      )}

      {stage === "error" && (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red/15 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Activation failed</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">{error}</p>
          </div>
          <button
            onClick={() => setStage("form")}
            className="mt-2 px-5 py-2 bg-card-elev border border-border-strong rounded-lg text-[12px]"
          >
            Try again
          </button>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className={cn("flex justify-between text-[11px]", gold ? "text-gold-muted" : "text-text-muted")}>
      <span>{label}</span>
      <span className={cn("font-mono", gold ? "text-gold font-medium" : "text-text")}>
        {value}
      </span>
    </div>
  );
}
