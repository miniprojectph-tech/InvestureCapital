"use client";

import { useEffect, useRef, useState } from "react";
import { mockTickers, type CoinTicker } from "./mock-data";

const COIN_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
};

const ENDPOINT =
  "https://api.coingecko.com/api/v3/simple/price?ids=" +
  Object.values(COIN_MAP).join(",") +
  "&vs_currencies=usd&include_24hr_change=true";

export type LiveTicker = CoinTicker & {
  direction: "up" | "down" | "flat";
};

export function useLiveTickers(refreshMs = 30000) {
  const [tickers, setTickers] = useState<LiveTicker[]>(() =>
    mockTickers.map((t) => ({ ...t, direction: "flat" }))
  );
  const prevPricesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchPrices() {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const data: Record<string, { usd: number; usd_24h_change: number }> = await res.json();
        if (cancelled) return;

        const updated: LiveTicker[] = Object.entries(COIN_MAP).map(([symbol, id]) => {
          const entry = data[id];
          const price = entry?.usd ?? 0;
          const change24h = entry?.usd_24h_change ?? 0;
          const prev = prevPricesRef.current[symbol];
          const direction: LiveTicker["direction"] =
            prev === undefined || prev === price ? "flat" : price > prev ? "up" : "down";
          prevPricesRef.current[symbol] = price;
          return { symbol, price, change24h, direction };
        });
        setTickers(updated);
      } catch {
        // network error: keep last known state
      }
    }

    fetchPrices();
    const id = setInterval(fetchPrices, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMs]);

  return tickers;
}
