import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeKey = "emerald" | "vault" | "blue" | "pink";

const themes: Record<
  ThemeKey,
  { iconBg: string; iconColor: string; ring: string; valueColor?: string }
> = {
  emerald: {
    iconBg: "bg-green/15",
    iconColor: "text-green",
    ring: "ring-green/15",
  },
  vault: {
    iconBg: "bg-vault/15",
    iconColor: "text-vault",
    ring: "ring-vault/20",
    valueColor: "text-vault",
  },
  blue: {
    iconBg: "bg-blue/15",
    iconColor: "text-blue",
    ring: "ring-blue/10",
  },
  pink: {
    iconBg: "bg-pink/15",
    iconColor: "text-pink",
    ring: "ring-pink/10",
  },
};

type Props = {
  icon: LucideIcon;
  theme: ThemeKey;
  title: string;
  subtitle?: string;
  caption?: { label: string; value: string };
  valueLabel: string;
  value: React.ReactNode;
  trend?: { delta: number; suffix?: string; label?: string };
  href?: string;
};

export function SummaryThemedCard({
  icon: Icon,
  theme,
  title,
  subtitle,
  caption,
  valueLabel,
  value,
  trend,
  href,
}: Props) {
  const t = themes[theme];
  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "relative bg-card border border-border rounded-xl p-4 overflow-hidden block lift",
        href && "cursor-pointer"
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-border-gold to-transparent opacity-50"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center ring-1",
              t.iconBg,
              t.ring
            )}
          >
            <Icon className={cn("w-4 h-4", t.iconColor)} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium m-0 truncate">{title}</p>
            {subtitle && (
              <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {caption && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-text-subtle m-0 leading-tight">{caption.label}</p>
            <p className="text-[11px] font-mono font-medium m-0">{caption.value}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0">
            {valueLabel}
          </p>
          <div
            className={cn(
              "text-[24px] font-mono font-medium tabular-nums leading-none tracking-tight mt-1",
              t.valueColor ?? "text-text"
            )}
          >
            {value}
          </div>
        </div>
        {trend && (
          <div className="text-right shrink-0">
            {trend.label && (
              <p className="text-[9px] text-text-subtle m-0">{trend.label}</p>
            )}
            <p
              className={cn(
                "text-[11px] font-mono mt-0.5 m-0 flex items-center gap-0.5 justify-end",
                trend.delta >= 0 ? "text-green" : "text-red"
              )}
            >
              {trend.delta >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {trend.delta >= 0 ? "+" : ""}
              {trend.delta.toFixed(2)}
              {trend.suffix ?? "%"}
            </p>
          </div>
        )}
      </div>
    </Wrapper>
  );
}
