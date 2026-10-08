"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one tab bar every admin page uses. Sticky under the page header so
 * every group is one tap away without scrolling; on phones the tabs scroll
 * sideways with a fade at the edge. Optional `right` slot for a Save button
 * or page actions that must never be off-screen.
 */
export type AdminTab<K extends string> = {
  id: K;
  label: string;
  icon?: LucideIcon;
  /** Small number chip (rows, pending items…). */
  count?: number;
  /** Short status chip ("on", "off", "Mon · Fri"). */
  hint?: string | null;
  hintTone?: "ok" | "warn" | "muted";
  /** Red dot for something that needs attention. */
  attention?: boolean;
};

export function AdminTabs<K extends string>({
  tabs,
  value,
  onChange,
  right,
  sticky = true,
  className,
}: {
  tabs: readonly AdminTab<K>[];
  value: K;
  onChange: (id: K) => void;
  right?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "z-10 -mx-1 px-1 py-2 mb-3 bg-canvas/95 backdrop-blur-sm flex flex-wrap items-center gap-2",
        sticky && "sticky top-0",
        className,
      )}
      role="tablist"
    >
      <div className="relative min-w-0 max-w-full after:pointer-events-none after:absolute after:right-0 after:top-0 after:bottom-0 after:w-8 after:rounded-r-xl after:bg-gradient-to-l after:from-canvas after:to-transparent md:after:hidden">
        <div className="flex gap-1 p-1 rounded-xl bg-card border border-border overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = value === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onChange(t.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] whitespace-nowrap shrink-0 transition",
                  on ? "bg-gold/15 text-gold font-medium" : "text-text-muted hover:text-text",
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {t.label}
                {typeof t.count === "number" && (
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full tabular-nums", on ? "bg-gold/15" : "bg-card-elev text-text-subtle")}>
                    {t.count.toLocaleString()}
                  </span>
                )}
                {t.hint && (
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full",
                      on ? "bg-gold/15" : "bg-card-elev text-text-subtle",
                      t.hintTone === "ok" && "text-green",
                      t.hintTone === "warn" && "text-[#F5C66B]",
                    )}
                  >
                    {t.hint}
                  </span>
                )}
                {t.attention && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red" aria-label="Needs attention" />}
              </button>
            );
          })}
        </div>
      </div>
      {right && <div className="ml-auto flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}

/**
 * Tab state remembered in the URL hash (`#rooms`), so a refresh, the back
 * button or a shared link lands on the same tab. `aliases` map old hashes
 * (e.g. `#withdrawal-schedule`) onto a tab id.
 */
export function useHashTab<K extends string>(ids: readonly K[], fallback: K, aliases?: Record<string, K>): [K, (k: K) => void] {
  const [tab, setTabState] = useState<K>(fallback);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (!h) return;
      const hit = (ids as readonly string[]).includes(h) ? (h as K) : aliases?.[h];
      if (hit) setTabState(hit);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
    // ids/aliases are stable literals on every page that uses this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setTab = useCallback((k: K) => {
    setTabState(k);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${k}`);
  }, []);
  return [tab, setTab];
}

