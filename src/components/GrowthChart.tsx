"use client";

import dynamic from "next/dynamic";
import { Card, CardHeader } from "./Card";
import { ChartSkeleton } from "./ChartSkeleton";

// Lazy-load the recharts-backed implementation. The Card/header shell renders
// immediately so layout is stable while the chart bundle loads.
export const GrowthChart = dynamic(
  () => import("./GrowthChart.impl").then((m) => m.GrowthChart),
  {
    ssr: false,
    loading: () => (
      <Card>
        <CardHeader title="Projected growth" subtitle="Loading…" />
        <ChartSkeleton height={140} />
        <div className="h-1.5 rounded-full bg-card-elev/40 animate-pulse mt-4" />
      </Card>
    ),
  }
);
