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
  blue: "text-blue",
  green: "text-green",
  gold: "text-gold",
  red: "text-red",
};

export function KpiCard({ label, value, sub, subTone = "muted", icon: Icon, iconTone = "blue" }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex justify-between items-start">
        <span className="text-[10px] text-text-subtle uppercase tracking-wide">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${iconToneClass[iconTone]}`} strokeWidth={2} />}
      </div>
      <p className="text-[17px] font-medium font-mono text-text mt-1.5 mb-0">{value}</p>
      {sub && <p className={`text-[10px] mt-1 m-0 ${subToneClass[subTone]}`}>{sub}</p>}
    </div>
  );
}
