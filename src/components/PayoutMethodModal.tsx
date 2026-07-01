"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle, Wallet, Building2, Smartphone } from "lucide-react";
import { Modal } from "./Modal";
import { cn } from "@/lib/utils";
import {
  type PayoutMethod,
  type PayoutMethodType,
  PAYOUT_METHOD_LABELS,
  ACCOUNT_NUMBER_LABEL,
  validatePayoutDraft,
} from "@/lib/payoutMethod";

type Props = {
  open: boolean;
  onClose: () => void;
  current?: PayoutMethod;
  onSave: (draft: {
    type: PayoutMethodType;
    accountName: string;
    accountNumber: string;
    bankName?: string;
  }) => Promise<void>;
};

const TYPE_META: Record<PayoutMethodType, { icon: typeof Wallet }> = {
  gcash: { icon: Smartphone },
  gotyme: { icon: Wallet },
  bankTransfer: { icon: Building2 },
};

const TYPES: PayoutMethodType[] = ["gcash", "gotyme", "bankTransfer"];

type Stage = "form" | "saving" | "success" | "error";

export function PayoutMethodModal({ open, onClose, current, onSave }: Props) {
  const [type, setType] = useState<PayoutMethodType>(current?.type ?? "gcash");
  const [accountName, setAccountName] = useState(current?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(current?.accountNumber ?? "");
  const [bankName, setBankName] = useState(current?.bankName ?? "");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever it's opened (or the current method changes).
  useEffect(() => {
    if (open) {
      setType(current?.type ?? "gcash");
      setAccountName(current?.accountName ?? "");
      setAccountNumber(current?.accountNumber ?? "");
      setBankName(current?.bankName ?? "");
      setStage("form");
      setError(null);
    }
  }, [open, current]);

  async function submit() {
    const draft = { type, accountName, accountNumber, bankName };
    const validationError = validatePayoutDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setStage("saving");
    setError(null);
    try {
      await onSave(draft);
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payout method");
      setStage("error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={current ? "Edit mode of payout" : "Add mode of payout"}>
      {stage === "form" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Payout channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => {
                const Icon = TYPE_META[t].icon;
                const selected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-[11px] transition",
                      selected
                        ? "bg-gold/15 border-gold/40 text-gold"
                        : "bg-canvas border-border text-text-muted hover:border-border-strong"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {PAYOUT_METHOD_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {type === "bankTransfer" && (
            <div>
              <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
                Bank name
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. BPI, BDO, UnionBank"
                className="w-full px-3 py-2.5 bg-canvas border border-border rounded-lg text-[13px] text-text outline-none focus:border-gold/40"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Account name
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Full name on the account"
              className="w-full px-3 py-2.5 bg-canvas border border-border rounded-lg text-[13px] text-text outline-none focus:border-gold/40"
            />
          </div>

          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              {ACCOUNT_NUMBER_LABEL[type]}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={type === "bankTransfer" ? "Account number" : "09xx xxx xxxx"}
              className="w-full px-3 py-2.5 bg-canvas border border-border rounded-lg text-[13px] font-mono text-text outline-none focus:border-gold/40"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-[10px] text-text-subtle m-0">
            Approved withdrawals are sent here. Make sure the details are correct — the admin pays out manually.
          </p>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              className="flex-1 py-2.5 rounded-lg text-[12px] font-medium bg-gold text-gold-dark hover:brightness-110 transition"
            >
              {current ? "Save changes" : "Save payout method"}
            </button>
          </div>
        </div>
      )}

      {stage === "saving" && (
        <div className="py-8 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-gold animate-spin" />
          <p className="text-[12px] text-text-muted m-0">Saving…</p>
        </div>
      )}

      {stage === "success" && (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Payout method saved</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">
              You can now request withdrawals to this account.
            </p>
          </div>
          <button
            onClick={onClose}
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
            <p className="text-[14px] font-medium m-0">Could not save</p>
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
