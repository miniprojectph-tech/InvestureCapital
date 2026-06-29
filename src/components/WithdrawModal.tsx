"use client";

import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { formatPHP, cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
};

type Stage = "form" | "processing" | "success";

export function WithdrawModal({ open, onClose, availableBalance }: Props) {
  const [amount, setAmount] = useState(0);
  const [stage, setStage] = useState<Stage>("form");

  function close() {
    onClose();
    setTimeout(() => {
      setStage("form");
      setAmount(0);
    }, 250);
  }

  function submit() {
    if (amount <= 0 || amount > availableBalance) return;
    setStage("processing");
    setTimeout(() => setStage("success"), 1400);
  }

  return (
    <Modal open={open} onClose={close} title="Withdraw to bank">
      {stage === "form" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Amount
            </label>
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-canvas border border-border rounded-lg focus-within:border-gold/40">
              <span className="text-[16px] text-text-subtle">₱</span>
              <input
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0.00"
                className="flex-1 bg-transparent text-[18px] font-medium font-mono text-text outline-none"
              />
              <button
                onClick={() => setAmount(availableBalance)}
                className="text-[10px] px-2 py-1 bg-gold/15 text-gold rounded-full"
              >
                Max
              </button>
            </div>
            <p className="text-[10px] text-text-subtle mt-1.5 m-0">
              Available: <span className="font-mono text-text">{formatPHP(availableBalance)}</span>
            </p>
          </div>

          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Destination
            </label>
            <div className="flex items-center gap-3 px-3 py-2.5 bg-canvas border border-border rounded-lg">
              <div className="w-8 h-8 rounded-md bg-blue/15 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">BPI Savings</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 font-mono">···· 3421</p>
              </div>
              <span className="text-[10px] text-text-subtle">Default</span>
            </div>
          </div>

          <div className="bg-canvas/50 rounded-lg p-3 border border-border">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Processing fee</span>
              <span className="font-mono">{formatPHP(0)}</span>
            </div>
            <div className="flex justify-between text-[11px] mt-1">
              <span className="text-text-muted">You&apos;ll receive</span>
              <span className="font-mono font-medium">{formatPHP(amount)}</span>
            </div>
            <p className="text-[10px] text-text-subtle mt-2 m-0">
              Withdrawals typically settle in 1–2 business days.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={close}
              className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={amount <= 0 || amount > availableBalance}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition",
                amount > 0 && amount <= availableBalance
                  ? "bg-gold text-gold-dark hover:brightness-110"
                  : "bg-card-elev text-text-subtle cursor-not-allowed"
              )}
            >
              Confirm withdrawal <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {stage === "processing" && (
        <div className="py-8 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-gold animate-spin" />
          <p className="text-[12px] text-text-muted m-0">Processing withdrawal…</p>
        </div>
      )}

      {stage === "success" && (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Withdrawal submitted</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">
              <span className="font-mono">{formatPHP(amount)}</span> to BPI ···· 3421
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
    </Modal>
  );
}
