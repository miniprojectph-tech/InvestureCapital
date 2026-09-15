"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { formatPHP, cn } from "@/lib/utils";
import { useCompPlan, projectPlacement, validatePlacementAmount, peso } from "@/lib/compplan";

type Props = {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  onSubmit: (amount: number, termMonths: number) => Promise<void>;
};

/** Place capital straight from the wallet — no payment proof needed. */
export function ReinvestModal({ open, onClose, availableBalance, onSubmit }: Props) {
  const { cfg } = useCompPlan();
  const [months, setMonths] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<"form" | "processing" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);
  const [placementId, setPlacementId] = useState<string | null>(null);

  const term = cfg.terms.find((t) => t.months === months) ?? cfg.terms[Math.min(1, cfg.terms.length - 1)];
  const numAmount = parseInt(amount) || 0;
  const maxUnits = Math.floor(availableBalance / cfg.increment);
  const max = maxUnits * cfg.increment;
  const amountError = numAmount > availableBalance ? "Exceeds your wallet balance" : validatePlacementAmount(cfg, numAmount);
  const valid = !amountError;
  const proj = projectPlacement(cfg, valid ? numAmount : cfg.minPlacement, term.months);

  function reset() {
    setMonths(null);
    setAmount("");
    setStage("form");
    setError(null);
    setPlacementId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!valid) return;
    setStage("processing");
    setError(null);
    try {
      await onSubmit(numAmount, term.months);
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
          <p className="text-[14px] font-medium">Placement active</p>
          <p className="text-[12px] text-text-muted">
            {formatPHP(numAmount)} placed for {term.months} month{term.months > 1 ? "s" : ""}{placementId ? ` · ${placementId}` : ""}. First payout in {cfg.cycleDays} days.
          </p>
          <button onClick={handleClose} className="mt-2 px-6 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-semibold">
            Done
          </button>
        </div>
      ) : stage === "error" ? (
        <div className="text-center py-6 space-y-3">
          <AlertCircle className="w-10 h-10 text-red mx-auto" />
          <p className="text-[14px] font-medium">Something went wrong</p>
          <p className="text-[12px] text-text-muted">{error}</p>
          <button onClick={() => setStage("form")} className="mt-2 px-6 py-2.5 border border-border rounded-lg text-[12px]">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-canvas border border-border rounded-lg flex items-center justify-between">
            <div>
              <p className="text-[10px] text-text-subtle m-0 mb-0.5">Wallet balance</p>
              <p className="text-[18px] font-mono font-medium m-0">{formatPHP(availableBalance)}</p>
            </div>
            {max >= cfg.minPlacement && (
              <button onClick={() => setAmount(String(max))} className="text-[10px] text-gold hover:underline">
                Use max ({formatPHP(max, { short: true })})
              </button>
            )}
          </div>

          {max < cfg.minPlacement ? (
            <p className="text-[11px] text-text-muted m-0">
              You need at least {formatPHP(cfg.minPlacement)} in your wallet to place capital.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-[11px] text-text-muted mb-1.5">Term</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {cfg.terms.map((t) => (
                    <button
                      key={t.months}
                      onClick={() => setMonths(t.months)}
                      className={cn(
                        "text-left p-2.5 rounded-lg border transition",
                        term.months === t.months ? "border-green bg-green/10" : "border-border hover:border-border-strong",
                      )}
                    >
                      <p className="text-[12px] font-medium m-0">{t.months} mo</p>
                      <p className="text-[9px] text-text-subtle m-0 mt-0.5">
                        {t.lockedBonusPerUnit > 0 ? `+${peso(t.lockedBonusPerUnit)} / ₱${cfg.increment.toLocaleString()}` : "No bonus"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-text-muted mb-1.5">
                  Amount (steps of ₱{cfg.increment.toLocaleString()}, up to {formatPHP(max)})
                </label>
                <input
                  type="number"
                  value={amount}
                  step={cfg.increment}
                  min={cfg.minPlacement}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Min ₱${cfg.minPlacement.toLocaleString()}`}
                  className="w-full bg-canvas border border-border rounded-md px-3 py-2.5 text-[14px] font-mono outline-none focus:border-gold/40"
                />
                {numAmount > 0 && amountError && <p className="text-[10px] text-red mt-1 m-0">{amountError}</p>}
              </div>

              {valid && (
                <div className="p-3 bg-canvas border border-border rounded-lg text-[11px] space-y-1">
                  <div className="flex justify-between"><span className="text-text-muted">Payout every {cfg.cycleDays} days</span><span className="font-mono text-green">+{peso(proj.perCycle)}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Payouts</span><span className="font-mono">{proj.cycles}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Total income</span><span className="font-mono">{formatPHP(proj.totalIncome)}</span></div>
                  {proj.lockedBonus > 0 && (
                    <div className="flex justify-between"><span className="text-vault-muted">Locked-In Bonus (final payout)</span><span className="font-mono text-vault">{formatPHP(proj.lockedBonus)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-dashed border-gold/25 pt-1 mt-1"><span className="text-gold-muted">Total return</span><span className="font-mono text-gold font-medium">{formatPHP(proj.total)}</span></div>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!valid || stage === "processing"}
                className="w-full py-3 bg-gold text-gold-dark rounded-lg text-[13px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {stage === "processing" ? (<><Loader2 className="w-4 h-4 animate-spin" /> Placing…</>) : `Place ${valid ? formatPHP(numAmount, { short: true }) : ""} from wallet`}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
