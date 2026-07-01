"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Building2,
  Smartphone,
  CreditCard,
  Copy,
  Check,
  Upload,
  X,
  ImageIcon,
} from "lucide-react";
import { Modal } from "./Modal";
import { formatPHP, cn } from "@/lib/utils";
import { useSettings, PAYMENT_METHOD_LABELS, type PaymentMethodId } from "@/lib/settings";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (args: {
    amount: number;
    method: PaymentMethodId;
    referenceNumber?: string;
    receiptFile?: File;
  }) => Promise<void>;
};

type Stage = "form" | "processing" | "success" | "error";

const methodIcons = {
  gotyme: Building2,
  gcash: Smartphone,
  bankTransfer: CreditCard,
} as const;

const presets = [1000, 5000, 10000, 50000];

export function TopUpModal({ open, onClose, onSubmit }: Props) {
  const { settings } = useSettings();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethodId | null>(null);
  const [refNum, setRefNum] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const methods = settings.paymentMethods;
    if (!methods) return;
    if (method && methods[method]?.enabled) return;
    const first = (["gotyme", "gcash", "bankTransfer"] as PaymentMethodId[]).find(
      (m) => methods[m]?.enabled
    );
    if (first) setMethod(first);
  }, [open, settings.paymentMethods, method]);

  // Cleanup blob URL when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    };
  }, [receiptPreview]);

  function close() {
    onClose();
    setTimeout(() => {
      setStage("form");
      setAmount(0);
      setRefNum("");
      setError(null);
      setCopied(null);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptFile(null);
      setReceiptPreview(null);
    }, 250);
  }

  function selectReceipt(file: File | undefined) {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Receipt must be an image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Receipt too large (max 5 MB)");
      return;
    }
    setError(null);
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  async function submit() {
    if (amount <= 0 || !method) return;
    setStage("processing");
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit({
          amount,
          method,
          referenceNumber: refNum.trim() || undefined,
          receiptFile: receiptFile ?? undefined,
        });
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setStage("error");
    }
  }

  function copy(text: string, key: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    });
  }

  const methods = settings.paymentMethods;
  const enabledMethods = methods
    ? (["gotyme", "gcash", "bankTransfer"] as PaymentMethodId[]).filter((m) => methods[m]?.enabled)
    : [];
  const selectedConfig = methods && method ? methods[method] : null;

  return (
    <Modal open={open} onClose={close} title="Request a top up" maxWidth="max-w-lg">
      {stage === "form" && (
        <div className="flex flex-col gap-4">
          {/* Amount */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              How much do you want to add?
            </label>
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-canvas border border-border rounded-lg focus-within:border-gold/40">
              <span className="text-[16px] text-text-subtle">₱</span>
              <input
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0.00"
                className="flex-1 bg-transparent text-[18px] font-medium font-mono text-text outline-none tabular-nums"
              />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {presets.map((p) => (
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
          </div>

          {/* Method picker */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Payment method
            </label>
            {enabledMethods.length === 0 ? (
              <div className="px-3 py-3 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  No payment methods are enabled yet. Ask an admin to configure GoTyme, GCash, or
                  Bank transfer in Settings.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {enabledMethods.map((m) => {
                  const Icon = methodIcons[m];
                  const active = method === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border transition",
                        active
                          ? "bg-gold/10 border-border-gold text-gold"
                          : "bg-card-elev border-border text-text-muted hover:text-text"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] font-medium">{PAYMENT_METHOD_LABELS[m]}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment instructions */}
          {selectedConfig && method && (
            <div className="bg-canvas border border-border rounded-lg p-3.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider m-0 mb-2">
                Send {amount > 0 ? formatPHP(amount) : "your amount"} to
              </p>
              <div
                className={cn(
                  "flex gap-3",
                  selectedConfig.qrCodeUrl ? "flex-col sm:flex-row" : "flex-col"
                )}
              >
                {selectedConfig.qrCodeUrl && (
                  <div className="shrink-0 self-center sm:self-start">
                    <div className="w-[140px] h-[140px] bg-white rounded-lg p-1.5 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedConfig.qrCodeUrl}
                        alt={`${PAYMENT_METHOD_LABELS[method]} QR`}
                        className="w-full h-full object-contain rounded"
                      />
                    </div>
                    <p className="text-[9px] text-text-subtle text-center mt-1.5 m-0">
                      Scan with {PAYMENT_METHOD_LABELS[method]}
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {selectedConfig.extra && method === "bankTransfer" && (
                    <InfoRow label="Bank" value={selectedConfig.extra} />
                  )}
                  <InfoRow
                    label="Account name"
                    value={selectedConfig.accountName || "—"}
                    onCopy={
                      selectedConfig.accountName
                        ? () => copy(selectedConfig.accountName, "name")
                        : undefined
                    }
                    copied={copied === "name"}
                  />
                  <InfoRow
                    label={method === "gcash" ? "Phone number" : "Account number"}
                    value={selectedConfig.accountNumber || "—"}
                    mono
                    onCopy={
                      selectedConfig.accountNumber
                        ? () => copy(selectedConfig.accountNumber, "num")
                        : undefined
                    }
                    copied={copied === "num"}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Reference number */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Reference / transaction number
            </label>
            <input
              type="text"
              value={refNum}
              onChange={(e) => setRefNum(e.target.value)}
              placeholder="e.g. GT-A1B2C3 (from your payment confirmation)"
              className="w-full bg-canvas border border-border rounded-lg px-3 py-2.5 text-[12px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle"
            />
          </div>

          {/* Receipt upload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-text-muted uppercase tracking-wider">
                Payment receipt
              </label>
              <span className="text-[9px] text-green">Recommended — speeds up approval</span>
            </div>
            {receiptPreview ? (
              <div className="relative bg-canvas border border-border rounded-lg p-2.5 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptPreview}
                  alt="Receipt preview"
                  className="w-14 h-14 object-cover rounded-md bg-white"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate m-0">{receiptFile?.name}</p>
                  <p className="text-[10px] text-text-subtle m-0 mt-0.5">
                    {receiptFile ? (receiptFile.size / 1024).toFixed(0) : 0} KB · ready to attach
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectReceipt(undefined)}
                  className="p-1.5 rounded-md text-text-subtle hover:text-red hover:bg-red/10 transition"
                  aria-label="Remove receipt"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="block bg-canvas border border-dashed border-border-strong rounded-lg px-3 py-4 cursor-pointer hover:border-border-gold hover:bg-gold/5 transition">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) selectReceipt(f);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="flex items-center justify-center gap-2 text-text-muted">
                  <Upload className="w-4 h-4" />
                  <span className="text-[12px]">Tap to upload a screenshot</span>
                </div>
                <p className="text-[9px] text-text-subtle text-center mt-1 m-0">
                  PNG / JPG · max 5 MB
                </p>
              </label>
            )}
          </div>

          <div className="flex gap-2 mt-1">
            <button
              onClick={close}
              className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={amount <= 0 || !method}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 transition",
                amount > 0 && method
                  ? "bg-gold text-gold-dark hover:brightness-110"
                  : "bg-card-elev text-text-subtle cursor-not-allowed"
              )}
            >
              Submit request <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {stage === "processing" && (
        <div className="py-10 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-gold animate-spin" />
          <p className="text-[12px] text-text-muted m-0">
            {receiptFile ? "Uploading receipt + submitting…" : "Submitting request…"}
          </p>
        </div>
      )}

      {stage === "success" && (
        <div className="py-8 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Request submitted</p>
            <p className="text-[11px] text-text-muted mt-1 m-0">
              <span className="font-mono">{formatPHP(amount)}</span> via{" "}
              {method ? PAYMENT_METHOD_LABELS[method] : ""}
              {receiptFile ? " with receipt" : ""} — admin will review and credit your wallet
              once verified.
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
        <div className="py-8 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red/15 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red" />
          </div>
          <div>
            <p className="text-[14px] font-medium m-0">Couldn&apos;t submit</p>
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

function InfoRow({
  label,
  value,
  mono,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-text-muted">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("text-[12px] text-text truncate", mono && "font-mono tabular-nums")}>
          {value}
        </span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="text-text-subtle hover:text-text transition shrink-0"
            aria-label="Copy"
          >
            {copied ? <Check className="w-3 h-3 text-green" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}
