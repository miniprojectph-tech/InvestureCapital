"use client";

import { cn } from "@/lib/utils";

/** A small on/off switch (gold when on). */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50", checked ? "bg-gold" : "bg-border-strong")}
    >
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full transition-[left]", checked ? "left-[18px] bg-gold-dark" : "left-0.5 bg-text-muted")} />
    </button>
  );
}
