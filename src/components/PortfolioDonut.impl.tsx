"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatPHP } from "@/lib/utils";

type Slice = { name: string; value: number; color: string };

type Props = {
  slices: Slice[];
};

export function PortfolioDonut({ slices }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[120px] h-[120px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={56}
              startAngle={90}
              endAngle={-270}
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[9px] text-text-subtle uppercase tracking-wider">Total</span>
          <span className="text-[12px] font-mono font-medium tabular-nums leading-tight">
            {formatPHP(total, { short: true })}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div key={s.name} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-[11px] text-text-muted flex-1 truncate">{s.name}</span>
              <span className="text-[10px] font-mono text-text-subtle">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
