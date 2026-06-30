"use client";

import { useLiveTickers, type LiveTicker } from "@/lib/useLiveTickers";

function formatPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function CoinChip({ coin }: { coin: LiveTicker }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-r border-border shrink-0">
      <span className="text-[12px] font-medium text-text">{coin.symbol}</span>
      <span
        className={`text-[12px] font-mono ${
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
        className={`text-[11px] font-mono ${
          coin.change24h >= 0 ? "text-green" : "text-red"
        }`}
      >
        {coin.change24h >= 0 ? "+" : ""}
        {coin.change24h.toFixed(2)}%
      </span>
    </div>
  );
}

export function CryptoTicker() {
  const tickers = useLiveTickers();

  return (
    <div className="flex items-stretch bg-card border border-border rounded-lg overflow-hidden">
      {/* Static Live badge */}
      <div className="flex items-center gap-2 px-3 py-2 border-r border-border-strong shrink-0 bg-card-elev/50">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-green animate-ping opacity-60" />
          <span className="relative w-2 h-2 rounded-full bg-green" />
        </span>
        <span className="text-[11px] font-medium text-text-muted tracking-wide">LIVE</span>
      </div>

      {/* Scrolling marquee — duplicate the list so the loop is seamless */}
      <div className="overflow-hidden flex-1 relative">
        <div className="ticker-track">
          {tickers.map((coin) => (
            <CoinChip key={`a-${coin.symbol}`} coin={coin} />
          ))}
          {tickers.map((coin) => (
            <CoinChip key={`b-${coin.symbol}`} coin={coin} />
          ))}
        </div>
      </div>
    </div>
  );
}
