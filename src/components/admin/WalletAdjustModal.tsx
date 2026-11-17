"use client";

import { useState } from "react";
import { Loader2, Plus, Minus, Check } from "lucide-react";
import { Modal } from "@/components/Modal";
import { cn, formatPHP } from "@/lib/utils";
import { adminAdjustWallet } from "@/lib/compplan";

export type WalletTarget = { uid: string; name: string; wallet: number };

const PRESET_TAGS = ["Adjustment", "Referral", "Bonus", "Refund", "Correction"];
const CUSTOM = "__custom__";

/**
 * Admin › Investors › Wallet: add to or remove from a member's wallet with a
 * tag. The member sees the line in their Activity; the note stays internal.
 */
export function WalletAdjustModal({ target, onClose, onDone }: { target: WalletTarget | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Adjust wallet · ${target.name}` : "Adjust wallet"} maxWidth="max-w-md">
      {target && <AdjustForm key={target.uid} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function AdjustForm({ target, onClose, onDone }: { target: WalletTarget; onClose: () => void; onDone: (message: string) => void }) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [tagChoice, setTagChoice] = useState<string>("Adjustment");
  const [customTag, setCustomTag] = useState("");
  const [amountText, setAmountText] = useState("");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = direction === "add";
  const amount = Math.round((Number(amountText.replace(/[,₱\s]/g, "")) || 0) * 100) / 100;
  const tag = (tagChoice === CUSTOM ? customTag : tagChoice).trim();
  const after = Math.round((target.wallet + (add ? amount : -amount)) * 100) / 100;

  async function submit() {
    if (amount <= 0) { setError("Enter an amount above ₱0."); return; }
    if (!tag) { setError("Type a tag."); return; }
    setBusy(true); setError(null);
    try {
      const r = await adminAdjustWallet({ userId: target.uid, direction, amount, tag, message: message.trim() || undefined, notify, note: note.trim() || undefined });
      onDone(`${add ? "Added" : "Removed"} ${formatPHP(amount)} (${tag}) ${add ? "to" : "from"} ${target.name}. Wallet is now ${formatPHP(r.walletAfter)}.${notify ? " The member was notified." : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "Could not adjust the wallet.");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-canvas text-[12px]">
        <span className="text-text-muted">Current wallet</span>
        <span className={cn("font-mono", target.wallet < 0 && "text-red")}>{formatPHP(target.wallet)}</span>
      </div>

      <div className="flex gap-1.5">
        <button type="button" onClick={() => setDirection("add")} aria-pressed={add}
          className={cn("flex-1 py-2 rounded-lg border text-[12px] flex items-center justify-center gap-1.5 transition", add ? "border-green bg-green/10 text-green font-medium" : "border-border text-text-muted hover:text-text")}>
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
        <button type="button" onClick={() => setDirection("remove")} aria-pressed={!add}
          className={cn("flex-1 py-2 rounded-lg border text-[12px] flex items-center justify-center gap-1.5 transition", !add ? "border-red bg-red/10 text-red font-medium" : "border-border text-text-muted hover:text-text")}>
          <Minus className="w-3.5 h-3.5" /> Remove
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Tag</span>
        <div className="flex flex-wrap gap-1.5">
          {[...PRESET_TAGS, CUSTOM].map((t) => (
            <button key={t} type="button" onClick={() => setTagChoice(t)} aria-pressed={tagChoice === t}
              className={cn("px-2.5 py-1 rounded-full border text-[11px] transition", tagChoice === t ? "border-green bg-green/10 text-green" : "border-border text-text-muted hover:text-text")}>
              {t === CUSTOM ? "+ Type a tag" : t}
            </button>
          ))}
        </div>
        {tagChoice === CUSTOM && (
          <input autoFocus value={customTag} maxLength={30} onChange={(e) => setCustomTag(e.target.value)} placeholder="Promo reward"
            className="mt-1 w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-green/50" />
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Amount</span>
        <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="1,000"
          className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-text outline-none focus:border-green/50" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">What the member sees</span>
        <input value={message} maxLength={160} onChange={(e) => setMessage(e.target.value)} placeholder={add ? "Referral commission moved from another account" : "Referral correction, wrong referrer"}
          className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-green/50" />
      </label>

      <div className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-canvas text-[12px]">
        <span className="text-text-muted">Wallet after</span>
        <span className={cn("font-mono", after < 0 && "text-red")}>{formatPHP(after)}</span>
      </div>
      {after < 0 && (
        <p className="text-[11px] text-red m-0 -mt-1.5">The wallet will be below zero. The member can&apos;t withdraw until their earnings bring it back above zero.</p>
      )}

      <button type="button" onClick={() => setNotify((v) => !v)} aria-pressed={notify} className="flex items-center gap-2 text-[12px] text-text text-left">
        <span className={cn("w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center", notify ? "border-green bg-green" : "border-border-strong")}>{notify && <Check className="w-2.5 h-2.5 text-canvas" />}</span>
        Tell the member (bell notice)
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Note (only admins see it)</span>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Customer typed the wrong email; moved to the right upline"
          className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-[12px] text-text outline-none focus:border-green/50" />
      </label>

      {error && <p className="text-[11px] text-red m-0">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted">Cancel</button>
        <button type="button" onClick={submit} disabled={busy}
          className={cn("flex-1 py-2.5 rounded-lg text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-1.5", add ? "bg-green text-canvas" : "bg-red text-white")}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : add ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          {add ? "Add" : "Remove"} {amount > 0 ? formatPHP(amount) : ""}
        </button>
      </div>
      <p className="text-[10px] text-text-subtle m-0">Saved to the admin audit with your name and note.</p>
    </div>
  );
}
