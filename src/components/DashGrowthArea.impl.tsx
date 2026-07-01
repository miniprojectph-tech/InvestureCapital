"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Point = { day: number; value: number };

export function DashGrowthArea({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="dashGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3DD598" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#3DD598" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="#3DD598"
          strokeWidth={1.8}
          fill="url(#dashGold)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
