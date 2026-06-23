"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "./Card";
import { formatPHP, formatNumber } from "@/lib/utils";
import { VAULT_DAILY_RATE } from "@/lib/mock-data";

type Props = {
  startingVault: number;
  currentDay?: number;
};

export function GrowthChart({ startingVault, currentDay = 4 }: Props) {
  const [horizon, setHorizon] = useState(365);

  const data = useMemo(() => {
    const steps = 60;
    const arr: { day: number; value: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const day = Math.round((i / steps) * horizon);
      arr.push({ day, value: startingVault * Math.pow(1 + VAULT_DAILY_RATE, day) });
    }
    return arr;
  }, [horizon, startingVault]);

  const finalValue = startingVault * Math.pow(1 + VAULT_DAILY_RATE, horizon);

  return (
    <Card>
      <CardHeader
        title="Projected growth"
        subtitle={`Day ${currentDay} of ${horizon}`}
        right={
          <span className="text-[10px] px-2 py-0.5 bg-gold/15 text-gold rounded-full font-medium">
            {formatPHP(finalValue, { short: true })} at day {horizon}
          </span>
        }
      />
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5C66B" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#F5C66B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide />
            <ReferenceLine x={currentDay} stroke="#4F8EF7" strokeWidth={0.5} strokeDasharray="2 2" />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#F5C66B"
              strokeWidth={1.8}
              fill="url(#goldFade)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3">
        <input
          type="range"
          min={30}
          max={730}
          step={5}
          value={horizon}
          onChange={(e) => setHorizon(parseInt(e.target.value))}
          className="w-full accent-[#F5C66B]"
          aria-label="Time machine — projection horizon"
        />
        <div className="flex justify-between text-[9px] text-text-subtle mt-1">
          <span>Day 30</span>
          <span>Day 180</span>
          <span>Day 365</span>
          <span>Day 730</span>
        </div>
      </div>
    </Card>
  );
}
