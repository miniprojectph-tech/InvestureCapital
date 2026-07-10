"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { formatPHP, cn } from "@/lib/utils";
import { usePlans } from "@/lib/plans";
import type { StoredPlan } from "@/lib/plans";

type Props = {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  onSubmit: (plan: StoredPlan, amount: number) => Promise<void>;
};

export function ReinvestModal({ open, onClose, availableBalance, onSubmit }: Props) {
  const { plans } = usePlans({ onlyActive: true });
  const [selectedPlan, setSelectedPlan] = useState<StoredPlan | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<"form" | "processing" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSelectedPlan(null);
    setAmount("");
    setStage("form");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const numAmount = parseFloat(amount) || 0;
  const min = selectedPlan?.minInvestment ?? 0;
  const max = Math.min(selectedPlan?.maxInvestment ?? Infinity, availableBalance);
  const valid = selectedPlan && numAmount >= min && numAmount <= max;

  async function handleSubmit() {
    if (!selectedPlan || !valid) return;
    setStage("processing");
    setError(null);
    try {
      await onSubmit(selectedPlan, numAmount);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reinvestment failed");
      setStage("error");
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Reinvest from wallet">
      {stage === "done" ? (
        <div className="text-center py-6 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-green mx-auto" />
          <p className="text-[14px] font-medium">Reinvestment successful!</p>
          <p className="text-[12px] text-text-muted">
            {formatPHP(numAmount)} reinvested into {selectedPlan?.name}
          </p>
          <button
            onClick={handleClose}
            className="mt-2 px-6 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-semibold"
          >
            Done
          </button>
        </div>
      ) : stage === "error" ? (
        <div className="text-center py-6 space-y-3">
          <AlertCircle className="w-10 h-10 text-red mx-auto" />
          <p className="text-[14px] font-medium">Something went wrong</p>
          <p className="text-[12px] text-text-muted">{error}</p>
          <button
            onClick={() => setStage("form")}
            className="mt-2 px-6 py-2.5 border border-border rounded-lg text-[12px]"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-canvas border border-border rounded-lg">
            <p className="text-[10px] text-text-subtle m-0 mb-0.5">Wallet balance</p>
            <p className="text-[18px] font-mono font-medium m-0">{formatPHP(availableBalance)}</p>
          </div>

          <div>
            <label className="block text-[11px] text-text-muted mb-1.5">Select a plan</label>
            <div className="grid grid-cols-1 gap-1.5">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPlan(p);
                    if (!amount) setAmount(String(Math.min(p.minInvestment, availableBalance)));
                  }}
                  disabled={availableBalance < p.minInvestment}
                  className={cn(
                    "text-left p-3 rounded-lg border transition text-[12px]",
                    selectedPlan?.id === p.id
                      ? "border-gold bg-gold/10"
                      : "border-border hover:border-border-strong",
                    availableBalance < p.minInvestment && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-text-subtle ml-2">
                    {p.durationDays}d · {p.dailyRate}% daily · min {formatPHP(p.minInvestment)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedPlan && (
            <div>
              <label className="block text-[11px] text-text-muted mb-1.5">
                Amount (₱{min.toLocaleString()} – ₱{max.toLocaleString()})
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min ₱${min.toLocaleString()}`}
                className="w-full bg-canvas border border-border rounded-md px-3 py-2.5 text-[14px] font-mono outline-none focus:border-gold/40"
              />
              {numAmount > 0 && numAmount < min && (
                <p className="text-[10px] text-red mt-1 m-0">Below minimum of {formatPHP(min)}</p>
              )}
              {numAmount > max && (
                <p className="text-[10px] text-red mt-1 m-0">Exceeds available balance</p>
              )}
              <button
                onClick={() => setAmount(String(max))}
                className="text-[10px] text-gold mt-1 hover:underline"
              >
                Use max ({formatPHP(max)})
              </button>
            </div>
          )}

          {selectedPlan && numAmount > 0 && valid && (
            <div className="p-3 bg-canvas border border-border rounded-lg text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Plan</span>
                <span>{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Capital</span>
                <span className="font-mono">{formatPHP(numAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Daily earnings</span>
                <span className="font-mono text-green">
                  +{formatPHP(numAmount * (selectedPlan.dailyRate / 100))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Total vault credit</span>
                <span className="font-mono text-green">
                  +{formatPHP(numAmount * (selectedPlan.dailyRate / 100) * selectedPlan.durationDays)}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!valid || stage === "processing"}
            className="w-full py-3 bg-gold text-gold-dark rounded-lg text-[13px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {stage === "processing" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing…
              </>
            ) : (
              "Confirm reinvestment"
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}
