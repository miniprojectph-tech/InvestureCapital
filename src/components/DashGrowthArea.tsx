"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";

// Lazy wrapper so the dashboard route doesn't statically import recharts.
export const DashGrowthArea = dynamic(
  () => import("./DashGrowthArea.impl").then((m) => m.DashGrowthArea),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={150} />,
  }
);
