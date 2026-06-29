import { cn } from "@/lib/utils";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  gold?: boolean;
  hoverable?: boolean;
};

export function Card({ children, className, gold, hoverable }: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl p-4 overflow-hidden",
        gold
          ? "bg-gradient-to-br from-card to-[#221B2E] border border-border-gold"
          : "bg-card border border-border",
        hoverable && "lift",
        className
      )}
    >
      {/* Hairline gold top edge — adds tactile depth without weight */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-border-gold to-transparent",
          gold ? "opacity-90" : "opacity-50"
        )}
      />
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start mb-3 gap-3">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-text m-0 truncate">{title}</p>
        {subtitle && (
          <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
