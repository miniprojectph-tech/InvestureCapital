import { cn } from "@/lib/utils";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  gold?: boolean;
};

export function Card({ children, className, gold }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        gold
          ? "bg-gradient-to-br from-card to-[#221B2E] border border-border-gold"
          : "bg-card border border-border",
        className
      )}
    >
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
    <div className="flex justify-between items-center mb-3">
      <div>
        <p className="text-[12px] font-medium text-text m-0">{title}</p>
        {subtitle && (
          <p className="text-[10px] text-text-subtle mt-0.5 m-0">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}
