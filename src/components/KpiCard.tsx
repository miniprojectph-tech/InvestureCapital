import { type LucideIcon } from "lucide-react";

type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  subTone?: "muted" | "green" | "red" | "gold";
  icon?: LucideIcon;
  iconTone?: "blue" | "green" | "gold" | "red";
};

const subToneClass = {
  muted: "text-text-subtle",
  green: "text-green",
  red: "text-red",
  gold: "text-gold-muted",
};

const iconToneClass = {
  blue: "text-blue bg-blue/10",
  green: "text-green bg-green/10",
  gold: "text-gold bg-gold/10",
  red: "text-red bg-red/10",
};

export function KpiCard({ label, value, sub, subTone = "muted", icon: Icon, iconTone = "blue" }: KpiCardProps) {
  return (
    <div className="relative bg-card border border-border rounded-xl p-3.5 overflow-hidden lift">
      {/* Subtle top-edge accent for premium card feel */}
      <span
        aria-hidden
        className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-border-gold to-transparent opacity-60"
      />
      <div className="flex justify-between items-start">
        <span className="text-[9.5px] text-text-subtle uppercase tracking-[0.14em]">{label}</span>
        {Icon && (
          <span
            className={`w-6 h-6 rounded-md flex items-center justify-center ${iconToneClass[iconTone]}`}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="text-[18px] font-medium font-mono text-text mt-2 mb-0 leading-none tracking-tight">
        {value}
      </p>
      {sub && <p className={`text-[10px] mt-1.5 m-0 ${subToneClass[subTone]}`}>{sub}</p>}
    </div>
  );
}
