"use client";

import { useEffect, useState } from "react";
import { useLiveTickers } from "@/lib/useLiveTickers";

function formatPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

export function CryptoTicker() {
  const tickers = useLiveTickers();
  // Trigger a brief flash class on the price text when direction changes
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    setFlashKey((k) => k + 1);
  }, [tickers]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full bg-green animate-ping opacity-60" />
          <span className="relative w-1.5 h-1.5 rounded-full bg-green" />
        </span>
        <span className="text-[10px] font-medium text-text-muted">Live</span>
      </div>
      <div className="w-px h-3 bg-border-strong shrink-0" />
      <div className="flex items-center gap-3 text-[11px] flex-1 min-w-0 overflow-hidden whitespace-nowrap">
        {tickers.map((coin, i) => (
          <div key={coin.symbol} className="flex items-center gap-3">
            {i > 0 && <div className="w-px h-3 bg-border shrink-0" />}
            <div className="inline-flex items-baseline gap-1.5">
              <span className="font-medium text-text">{coin.symbol}</span>
              <span
                key={`${coin.symbol}-${flashKey}`}
                className={`font-mono ${
                  coin.direction === "up"
                    ? "flash-up text-text-muted"
                    : coin.direction === "down"
                    ? "flash-down text-text-muted"
                    : "text-text-muted"
                }`}
              >
                {formatPrice(coin.price)}
              </span>
              <span
                className={`font-mono ${coin.change24h >= 0 ? "text-green" : "text-red"}`}
              >
                {coin.change24h >= 0 ? "+" : ""}
                {coin.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
