"use client";

import dynamic from "next/dynamic";

// Lazy-load the recharts-backed implementation so the (heavy) charting
// bundle is fetched on demand rather than blocking initial route JS.
export const PortfolioDonut = dynamic(
  () => import("./PortfolioDonut.impl").then((m) => m.PortfolioDonut),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-4">
        <div className="w-[120px] h-[120px] rounded-full bg-card-elev/40 animate-pulse shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-3 rounded bg-card-elev/40 animate-pulse" />
          <div className="h-3 rounded bg-card-elev/40 animate-pulse w-4/5" />
          <div className="h-3 rounded bg-card-elev/40 animate-pulse w-3/5" />
        </div>
      </div>
    ),
  }
);
