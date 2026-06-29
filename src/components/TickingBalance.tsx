"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  base: number;
  /** Daily compound rate as decimal (0.01 = 1% daily). */
  dailyRate?: number;
  /** Extra constant added to the ticking vault portion (e.g. wallet + deployed). */
  offset?: number;
  /** Decimal places to show. More = more visible ticking. */
  decimals?: number;
  /** Update interval in ms. Default 100ms = smooth ticking without thrashing. */
  intervalMs?: number;
  /** Render the number with a currency prefix. Default true (₱). */
  currency?: boolean;
  className?: string;
};

export function TickingBalance({
  base,
  dailyRate = 0.01,
  offset = 0,
  decimals = 2,
  intervalMs = 100,
  currency = true,
  className,
}: Props) {
  const [value, setValue] = useState(base + offset);

  useEffect(() => {
    const startTime = Date.now();
    const id = setInterval(() => {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const elapsedDays = elapsedSec / 86400;
      const next = base * Math.pow(1 + dailyRate, elapsedDays) + offset;
      setValue(next);
    }, intervalMs);
    return () => clearInterval(id);
  }, [base, dailyRate, offset, intervalMs]);

  const formatted = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  return (
    <span className={cn("tabular-nums", className)}>
      {currency ? "₱" : ""}
      {formatted}
    </span>
  );
}
