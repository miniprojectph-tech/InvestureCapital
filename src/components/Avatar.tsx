"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Initials from a name, falling back to the first letter of an email. */
export function initialsOf(name: string, email = ""): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return (s || email[0] || "?").toUpperCase();
}

const PALETTE: [string, string][] = [
  ["#1E3A5F", "#9CC6FF"], ["#3B2A5F", "#C9B5FF"], ["#1F4D3A", "#7FE8C4"], ["#5A2E1E", "#FFB38A"],
  ["#4A1F3A", "#FF8DB4"], ["#4A3A12", "#F5C66B"], ["#1F3F4D", "#5CE0D2"], ["#2E2E4A", "#B4B2F0"],
];
/** A stable colour pair for an id, so a member's initials always look the same. */
export function colorFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * A member's picture, or their initials on a stable colour when they have none
 * (or the picture fails to load). `size` in px.
 */
export function Avatar({ src, name, email, id, size = 32, className, ring, style }: {
  src?: string | null;
  name: string;
  email?: string;
  /** Seeds the fallback colour; defaults to the name. */
  id?: string;
  size?: number;
  className?: string;
  /** Tailwind ring classes, e.g. "ring-2 ring-gold/40". */
  ring?: string;
  style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const [bg, fg] = colorFor(id ?? name);
  const showImg = !!src && !broken;
  return (
    <div
      className={cn("rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold select-none", ring, className)}
      style={{ width: size, height: size, background: showImg ? "#0E1A2C" : bg, color: fg, fontSize: Math.max(9, Math.round(size * 0.36)), ...style }}
      aria-hidden="true"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initialsOf(name, email)
      )}
    </div>
  );
}
