"use client";

import { cn } from "@/lib/utils";
import type { MemberStatus } from "@/lib/activeStatus";

/** Green = active now, amber = away; nothing when offline or unknown. Sits on the corner of an avatar. */
export function StatusDot({ status, className }: { status?: MemberStatus | null; className?: string }) {
  if (!status || status.state === "offline") return null;
  return (
    <span
      className={cn("absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-card", status.state === "active" ? "bg-green" : "bg-[#F5A524]", className)}
      aria-label={status.state === "active" ? "Active now" : "Away"}
    />
  );
}

/** The colour for a status line. */
export const statusTone = (s?: MemberStatus | null) => (!s ? "text-text-subtle" : s.state === "active" ? "text-green" : s.state === "away" ? "text-[#F5A524]" : "text-text-subtle");
