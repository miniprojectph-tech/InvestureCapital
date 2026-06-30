"use client";

import { useState } from "react";
import { ArrowDownToLine, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";

type Props = {
  onSubmit?: (amount: number) => Promise<void>;
  disabled?: boolean;
};

const presets = [1000, 5000, 10000, 50000];

type Stage = "input" | "processing" | "success" | "error";

export function TopUpPanel({ onSubmit, disabled }: Props) {
  const [amount, setAmount] = useState(0);
  const [stage, setStage] = useState<Stage>("input");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStage("input");
    setError(null);
  }

  async function submit() {
    if (amount <= 0 || disabled) return;
    setStage("processing");
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(amount);
      } else {
        await new Promise((r) => setTimeout(r, 800));
      }
      setStage("success");
      setTimeout(() => {
        setAmount(0);
        setStage("input");
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top up failed");
      setStage("error");
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
      <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-1.5">
        Top up wallet
      </p>

      {stage === "success" ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-4 gap-2">
          <div className="w-11 h-11 rounded-full bg-green/15 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green" />
          </div>
          <p className="text-[13px] font-medium m-0">Funds added</p>
          <p className="text-[11px] text-text-muted m-0 font-mono">
            +{formatPHP(amount)} → wallet
          </p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 bg-canvas border rounded-lg transition",
              stage === "processing"
                ? "border-border opacity-60"
                : "border-border focus-within:border-gold/40"
            )}
          >
            <span className="text-[18px] text-text-subtle">₱</span>
            <input
              type="number"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0.00"
              disabled={stage === "processing"}
              className="flex-1 bg-transparent text-[20px] font-medium font-mono text-text outline-none tabular-nums"
              aria-label="Top up amount"
            />
          </div>

          <div className="flex gap-1.5 mt-2 flex-wrap">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                disabled={stage === "processing"}
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

          {error && (
            <div className="mt-3 flex items-start gap-2 px-2.5 py-1.5 bg-red/10 border border-red/30 rounded-md text-[10px] text-red">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={stage === "error" ? reset : submit}
            disabled={(amount <= 0 || disabled) && stage !== "error"}
            className={cn(
              "mt-auto w-full py-2.5 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2 transition",
              stage === "error"
                ? "bg-card-elev border border-border-strong text-text"
                : amount > 0 && !disabled
                ? "bg-gold text-gold-dark hover:brightness-110"
                : "bg-card-elev text-text-subtle cursor-not-allowed"
            )}
          >
            {stage === "processing" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…
              </>
            ) : stage === "error" ? (
              "Try again"
            ) : (
              <>
                <ArrowDownToLine className="w-3.5 h-3.5" /> Add funds
              </>
            )}
          </button>

          <p className="text-[9px] text-text-subtle m-0 mt-2 flex items-start gap-1">
            <Info className="w-2.5 h-2.5 shrink-0 mt-0.5" />
            Simulated deposit · in production routes through a payment gateway
          </p>
        </>
      )}
    </div>
  );
}
