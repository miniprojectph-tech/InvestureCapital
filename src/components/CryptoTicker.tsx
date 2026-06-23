"use client";

import { mockTickers } from "@/lib/mock-data";

export function CryptoTicker() {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green" />
        <span className="text-[10px] font-medium text-text-muted">Live</span>
      </div>
      <div className="w-px h-3 bg-border-strong shrink-0" />
      <div className="flex items-center gap-3 text-[11px] flex-1 min-w-0 overflow-hidden whitespace-nowrap">
        {mockTickers.map((coin, i) => (
          <div key={coin.symbol} className="flex items-center gap-3">
            {i > 0 && <div className="w-px h-3 bg-border shrink-0" />}
            <div className="inline-flex items-baseline gap-1.5">
              <span className="font-medium text-text">{coin.symbol}</span>
              <span className="font-mono text-text-muted">
                ${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(2)}
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
