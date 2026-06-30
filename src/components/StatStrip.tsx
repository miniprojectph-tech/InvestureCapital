import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatItem = {
  label: string;
  value: string;
  caption?: string;
  trend?: { delta: number; suffix?: string };
  emphasis?: boolean;
};

export function StatStrip({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "px-4 py-3 lg:py-1",
            i > 0 && i % 2 !== 0 ? "border-l border-border" : "",
            i >= 2 ? "border-t border-border lg:border-t-0" : "",
            i > 0 && i % 2 === 0 ? "lg:border-l border-border" : ""
          )}
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-text-subtle uppercase tracking-[0.12em]">
              {s.label}
            </span>
            {s.caption && (
              <span className="text-[9px] text-text-dim font-mono">{s.caption}</span>
            )}
          </div>
          <p
            className={cn(
              "m-0 leading-none",
              s.emphasis
                ? "text-[26px] tracking-tight"
                : "text-[20px] font-mono font-medium tracking-tight"
            )}
            style={
              s.emphasis
                ? {
                    fontFamily: "var(--font-display)",
                    fontVariationSettings: '"opsz" 144, "SOFT" 30',
                    letterSpacing: "-0.025em",
                  }
                : undefined
            }
          >
            {s.value}
          </p>
          {s.trend && (
            <p
              className={cn(
                "mt-1 m-0 text-[10px] flex items-center gap-1",
                s.trend.delta >= 0 ? "text-green" : "text-red"
              )}
            >
              {s.trend.delta >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span className="font-mono">
                {s.trend.delta >= 0 ? "+" : ""}
                {s.trend.delta.toFixed(2)}
                {s.trend.suffix ?? "%"}
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
