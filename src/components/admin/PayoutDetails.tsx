"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import type { WithdrawalRequest } from "@/lib/withdrawals";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {});
      }}
      className="p-1 rounded text-text-subtle hover:text-gold shrink-0"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {done ? <Check className="w-3 h-3 text-green" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

/** Admin › Withdrawals: where to send the money, in full, with copy buttons. */
export function PayoutDetails({ r }: { r: WithdrawalRequest }) {
  const p = r.payout;
  if (!p) {
    return (
      <p className="text-[10px] mt-0.5 m-0 truncate flex items-center gap-1">
        <Send className="w-2.5 h-2.5 text-gold shrink-0" />
        <span className="text-text font-mono">{r.destination}</span>
      </p>
    );
  }
  return (
    <div className="mt-1.5 bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-[11px] max-w-[420px]">
      <div className="flex items-center gap-1.5">
        <Send className="w-3 h-3 text-gold shrink-0" />
        <span className="text-gold font-medium">{p.provider}</span>
        {p.from === "profile" && !p.changedSince && <span className="text-[9px] text-text-subtle">(from their saved payout method)</span>}
      </div>
      {p.changedSince && (
        <p className="text-[10px] text-red m-0 mt-1 leading-snug">
          They changed their payout account after asking. The request was for <span className="font-mono">{r.destination}</span>; below is the account saved now. Confirm with the member before sending.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-text-subtle shrink-0">Account name</span>
        <span className="flex items-center gap-0.5 min-w-0"><span className="text-text truncate">{p.accountName}</span><CopyButton value={p.accountName} label="account name" /></span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-text-subtle shrink-0">{p.type === "gcash" ? "GCash number" : p.type === "gotyme" ? "GoTyme account" : "Account number"}</span>
        <span className="flex items-center gap-0.5 min-w-0"><span className="text-text font-mono tracking-wide truncate">{p.accountNumber}</span><CopyButton value={p.accountNumber} label="account number" /></span>
      </div>
    </div>
  );
}
