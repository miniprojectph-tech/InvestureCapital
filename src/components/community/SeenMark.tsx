"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/community";

/**
 * Under a conversation whose last message is OURS: has the member opened it
 * since? `readAt` is their last-read stamp; seen when it is at or after `lastAt`.
 */
/** `now` (a ticking clock from the caller) is needed only for the "Seen 2h ago" form. */
export function SeenMark({ lastAt, readAt, now, className }: { lastAt: number; readAt?: number; now?: number; className?: string }) {
  const seen = (readAt ?? 0) >= lastAt;
  const when = seen && now !== undefined && readAt ? (now - readAt < 60_000 ? " just now" : ` ${formatRelative(readAt)} ago`) : "";
  return (
    <span className={cn("inline-flex items-center gap-0.5", seen ? "text-green" : "text-text-subtle", className)}>
      {seen ? <><Check className="w-2.5 h-2.5" /> Seen{when}</> : "Not seen yet"}
    </span>
  );
}
