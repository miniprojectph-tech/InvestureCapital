// Lightweight loading placeholder shown while a chart's recharts bundle
// loads on demand. No dependencies so it stays out of the heavy chunk.
export function ChartSkeleton({ height = 140 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-lg bg-card-elev/40 animate-pulse"
      style={{ height }}
      aria-hidden
    />
  );
}
