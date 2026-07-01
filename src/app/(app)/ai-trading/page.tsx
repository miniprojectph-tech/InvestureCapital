"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  Lock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Loader2,
  Circle,
  Info,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { TopHeader } from "@/components/TopHeader";
import { formatPHP, cn } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import { useSettings } from "@/lib/settings";
import { useLiveTickers } from "@/lib/useLiveTickers";

type OrderType = "limit" | "market" | "stop-limit" | "stop-market";

export default function AiTradingPage() {
  const { state, loading } = useUserState();
  const { settings, loading: settingsLoading } = useSettings();
  const tickers = useLiveTickers(60000);
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [postOnly, setPostOnly] = useState(true);
  const [tf, setTf] = useState("1D");

  if (loading || settingsLoading || !state) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const threshold = settings.aiTrading?.unlockThreshold ?? 100000;
  const wallet = state.balances.wallet;
  const locked = wallet < threshold;
  const progressPct = Math.min(100, (wallet / threshold) * 100);
  const btc = tickers.find((t) => t.symbol === "BTC");

  return (
    <div className="relative">
      <TopHeader
        title="AI Trading"
        subtitle={
          locked
            ? `Locked · reach ₱${threshold.toLocaleString()} wallet balance to unlock`
            : `Enabled · trading via ${settings.aiTrading?.provider ?? "provider"}`
        }
      />

      <div
        className={cn(
          "transition-all",
          locked && "pointer-events-none select-none blur-[6px] opacity-70"
        )}
      >
        <TradingInterface
          btc={btc}
          orderType={orderType}
          setOrderType={setOrderType}
          size={size}
          setSize={setSize}
          price={price}
          setPrice={setPrice}
          postOnly={postOnly}
          setPostOnly={setPostOnly}
          tf={tf}
          setTf={setTf}
          walletBalance={wallet}
        />
      </div>

      {locked && <LockOverlay wallet={wallet} threshold={threshold} progressPct={progressPct} />}
    </div>
  );
}

function LockOverlay({
  wallet,
  threshold,
  progressPct,
}: {
  wallet: number;
  threshold: number;
  progressPct: number;
}) {
  const remaining = Math.max(0, threshold - wallet);
  return (
    <div className="absolute inset-0 flex items-start justify-center pt-24 pointer-events-none">
      <div className="bg-card/90 backdrop-blur-md border border-border-gold rounded-2xl p-8 max-w-md text-center relative overflow-hidden pointer-events-auto">
        <span
          aria-hidden
          className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
        />
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/25 to-vault/20 flex items-center justify-center mx-auto mb-4 ring-1 ring-border-gold">
          <Lock className="w-7 h-7 text-gold" strokeWidth={2} />
        </div>
        <p
          className="text-text m-0 mb-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "24px",
            fontVariationSettings: '"opsz" 144, "SOFT" 30',
            letterSpacing: "-0.01em",
          }}
        >
          AI Trading is locked
        </p>
        <p className="text-[12px] text-text-muted m-0 mb-5 leading-relaxed">
          Unlock the AI-powered trading engine once your wallet reaches{" "}
          <span className="text-gold font-mono">{formatPHP(threshold, { short: true })}</span>.
          Trade crypto pairs, convert BTC, and let the AI optimise entries and exits automatically.
        </p>

        <div className="bg-canvas border border-border rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="text-text-subtle">Your wallet</span>
            <span className="font-mono text-text">
              {formatPHP(wallet, { short: true })} /{" "}
              <span className="text-text-muted">{formatPHP(threshold, { short: true })}</span>
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold to-vault transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-text-subtle mt-2 m-0">
            {remaining > 0 ? (
              <>
                <span className="text-gold-muted font-mono">{formatPHP(remaining, { short: true })}</span>{" "}
                to unlock · top up wallet to progress
              </>
            ) : (
              <span className="text-green">Threshold reached — refresh to enter</span>
            )}
          </p>
        </div>

        <a
          href="/wallet"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 transition"
        >
          <Sparkles className="w-3.5 h-3.5" /> Top up to unlock
        </a>
      </div>
    </div>
  );
}

// === Trading interface ===

const bidsAsks = Array.from({ length: 6 }, (_, i) => ({
  price: 58420 - i * 12,
  size: 0.01 + (i % 3) * 0.02,
  total: 14.1 - i * 0.4,
}));

const trades = Array.from({ length: 10 }, (_, i) => ({
  price: 58420 - i * 8,
  size: 0.01,
  time: "14:10",
}));

const pairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "USDT/USDC", "DAI/USDT"];

function TradingInterface({
  btc,
  orderType,
  setOrderType,
  size,
  setSize,
  price,
  setPrice,
  postOnly,
  setPostOnly,
  tf,
  setTf,
  walletBalance,
}: {
  btc?: { price: number; change24h: number };
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  size: string;
  setSize: (s: string) => void;
  price: string;
  setPrice: (p: string) => void;
  postOnly: boolean;
  setPostOnly: (v: boolean) => void;
  tf: string;
  setTf: (t: string) => void;
  walletBalance: number;
}) {
  const btcPrice = btc?.price ?? 58420;
  const change = btc?.change24h ?? 5.3;
  const chartData = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        t: i,
        v: btcPrice * (1 + Math.sin(i / 3) * 0.05 + (Math.random() - 0.5) * 0.02),
      })),
    [btcPrice]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Top: Market info + Wallet */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 fill-gold text-gold" />
              <p className="text-[13px] font-medium m-0">BTC — USD Perpetual Swap</p>
            </div>
            <div className="text-[11px] text-text-subtle">
              24h Change{" "}
              <span
                className={cn(
                  "font-mono ml-1",
                  change >= 0 ? "text-green" : "text-red"
                )}
              >
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MarketStat label="24h Volume" value="814,107.51 USD" />
            <MarketStat label="Index Price" value={`${btcPrice.toLocaleString()} USD`} />
            <MarketStat label="Mark Price" value={`${(btcPrice + 24).toLocaleString()} USD`} />
            <MarketStat
              label="Last Price"
              value={`${(btcPrice + 63).toLocaleString()} USD`}
              tone="green"
            />
            <MarketStat label="Funding Rate" value="0.1392%" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-medium m-0">Your Wallet</p>
            <span className="text-[10px] text-text-subtle">Live</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <MarketStat label="Equity" value={formatPHP(walletBalance, { short: true })} small />
            <MarketStat label="Available" value={formatPHP(walletBalance * 0.85, { short: true })} small />
            <MarketStat label="Unrealized P&L" value="+₱92" tone="green" small />
            <MarketStat label="Position" value="₱0" small />
            <MarketStat label="Active Orders" value="0" small />
          </div>
        </div>
      </div>

      {/* Main: Order form + Chart + Order Book */}
      <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_280px] gap-3">
        {/* Order form */}
        <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col">
          <div className="flex text-[11px] mb-3 border-b border-border">
            {(["limit", "market", "stop-limit", "stop-market"] as OrderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "flex-1 pb-2 capitalize transition",
                  orderType === t
                    ? "text-gold border-b border-gold -mb-px"
                    : "text-text-muted hover:text-text"
                )}
              >
                {t.replace("-", " ")}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 flex-1">
            <FormField label="Pair">
              <select className="bg-canvas border border-border rounded-md px-2 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full">
                <option>Bitcoin (BTC)</option>
                <option>Ethereum (ETH)</option>
                <option>Solana (SOL)</option>
              </select>
            </FormField>
            <FormField label="Size (USD)">
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="Enter size"
                className="bg-canvas border border-border rounded-md px-2 py-2 text-[12px] font-mono text-text outline-none focus:border-gold/40 w-full"
              />
            </FormField>
            {(orderType === "limit" || orderType === "stop-limit") && (
              <FormField label="Price (USD)">
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={btcPrice.toString()}
                  className="bg-canvas border border-border rounded-md px-2 py-2 text-[12px] font-mono text-text outline-none focus:border-gold/40 w-full"
                />
              </FormField>
            )}
            <FormField label="Time In Force">
              <select className="bg-canvas border border-border rounded-md px-2 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full">
                <option>Good &apos;Til Cancelled</option>
                <option>Immediate Or Cancel</option>
                <option>Fill Or Kill</option>
              </select>
            </FormField>
            <label className="flex items-center justify-between text-[11px] py-1 cursor-pointer">
              <span className="text-text-muted">Post Only</span>
              <Toggle on={postOnly} onChange={setPostOnly} />
            </label>

            <div className="border-t border-border pt-2.5 mt-1 flex flex-col gap-1.5 text-[10px]">
              <SummaryRow label="Size in BTC" value={size ? (parseFloat(size) / btcPrice).toFixed(5) + " BTC" : "0.00000 BTC"} />
              <SummaryRow label="Order Value" value={size ? `${size} USD` : "0 USD"} />
              <SummaryRow label="Available Margin" value={`${(walletBalance / 55).toFixed(0)} USD`} />
              <SummaryRow label="Buy Cost @ 1.0x" value="0.00 USD" />
              <SummaryRow label="Sell Cost @ 1.0x" value="0.00 USD" />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto pt-3">
              <button className="py-2.5 bg-green text-white rounded-lg text-[12px] font-medium hover:brightness-110 transition">
                Buy / Long
              </button>
              <button className="py-2.5 bg-red text-white rounded-lg text-[12px] font-medium hover:brightness-110 transition">
                Sell / Short
              </button>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <p className="text-[13px] font-medium m-0">BTC / USDT</p>
              <div className="flex items-center gap-2 text-[10px] text-text-subtle">
                <span>
                  O <span className="font-mono text-text">{(btcPrice - 100).toFixed(0)}</span>
                </span>
                <span>
                  H <span className="font-mono text-green">{(btcPrice + 200).toFixed(0)}</span>
                </span>
                <span>
                  L <span className="font-mono text-red">{(btcPrice - 300).toFixed(0)}</span>
                </span>
                <span>
                  C <span className="font-mono text-text">{btcPrice.toFixed(0)}</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {["1m", "30m", "1h", "1D"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={cn(
                    "text-[10px] px-2.5 py-1 rounded-full transition",
                    tf === t
                      ? "bg-gold/15 text-gold font-medium"
                      : "text-text-subtle hover:text-text"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <defs>
                  <linearGradient id="btc-fade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5C66B" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#F5C66B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Area type="monotone" dataKey="v" stroke="#F5C66B" strokeWidth={1.8} fill="url(#btc-fade)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-[10px] text-text-subtle mt-2 pt-2 border-t border-border">
            <div className="flex gap-2">
              {["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"].map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
            <span className="font-mono">00:05:40 UTC</span>
          </div>
        </div>

        {/* Order Book + Trade History */}
        <div className="flex flex-col gap-3">
          <div className="bg-card border border-border rounded-xl p-3.5">
            <p className="text-[13px] font-medium m-0 mb-2.5">Order Book</p>
            <div className="grid grid-cols-3 text-[9px] text-text-subtle uppercase tracking-wider mb-1">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Total</span>
            </div>
            {bidsAsks.map((a, i) => (
              <div key={`ask-${i}`} className="grid grid-cols-3 text-[11px] font-mono py-0.5">
                <span className="text-red">{a.price.toLocaleString()}</span>
                <span className="text-right text-text-muted">{a.size.toFixed(3)}</span>
                <span className="text-right text-text-muted">{a.total.toFixed(3)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[11px] py-1.5 border-y border-border my-1.5">
              <span className="text-red font-mono">↓ 6587.35</span>
              <span className="text-[9px] text-text-subtle">6520.220 / 4835.00</span>
            </div>
            {bidsAsks.slice(0, 2).map((a, i) => (
              <div key={`bid-${i}`} className="grid grid-cols-3 text-[11px] font-mono py-0.5">
                <span className="text-green">{a.price.toLocaleString()}</span>
                <span className="text-right text-text-muted">{a.size.toFixed(3)}</span>
                <span className="text-right text-text-muted">{a.total.toFixed(3)}</span>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-3.5">
            <p className="text-[13px] font-medium m-0 mb-2.5">Trade History</p>
            <div className="grid grid-cols-3 text-[9px] text-text-subtle uppercase tracking-wider mb-1">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Time</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {trades.map((t, i) => (
                <div key={i} className="grid grid-cols-3 text-[11px] font-mono">
                  <span className={i % 3 === 0 ? "text-green" : "text-red"}>
                    {t.price.toLocaleString()}
                  </span>
                  <span className="text-right text-text-muted">{t.size.toFixed(3)}</span>
                  <span className="text-right text-text-subtle">{t.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Pairs + Portfolio + AI signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3.5">
          <p className="text-[13px] font-medium m-0 mb-2.5">Pairs</p>
          <div className="flex flex-col gap-1">
            {pairs.map((p) => (
              <button
                key={p}
                className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-card-elev transition text-[11px]"
              >
                <span className="font-medium">{p}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-text-muted">
                    ${(58420 - Math.random() * 5000).toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      Math.random() > 0.5 ? "text-green" : "text-red"
                    )}
                  >
                    {Math.random() > 0.5 ? "+" : "-"}
                    {(Math.random() * 3).toFixed(2)}%
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col">
          <p className="text-[13px] font-medium m-0 mb-2">Your Trading Portfolio</p>
          <p
            className="m-0 text-text font-mono tabular-nums"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "32px",
              fontVariationSettings: '"opsz" 144, "SOFT" 30',
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {formatPHP(walletBalance, { short: true })}
          </p>
          <p className="text-[11px] text-green m-0 mt-1 font-mono">+₱1,240 · +1.96% today</p>

          <div className="mt-auto pt-4 grid grid-cols-3 gap-2 text-[10px]">
            <MiniStat label="BTC" value="0.0021" />
            <MiniStat label="ETH" value="0.038" />
            <MiniStat label="USDT" value="245" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-medium m-0 flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-gold" /> AI Signals
            </p>
            <span className="text-[10px] bg-green/15 text-green px-2 py-0.5 rounded-full font-medium">
              Bullish bias
            </span>
          </div>
          <div className="flex flex-col gap-2 text-[11px]">
            <AiSignal type="up" pair="BTC/USDT" msg="Trend confirmed — long position opened" time="12:42" />
            <AiSignal type="down" pair="SOL/USDT" msg="Position closed at +1.2%" time="12:38" />
            <AiSignal type="up" pair="ETH/USDT" msg="Momentum breakout detected" time="12:31" />
            <AiSignal type="up" pair="BTC/USDT" msg="Support level held @ 58,000" time="12:15" />
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[10px] text-text-subtle">
            <Info className="w-3 h-3" />
            AI signals refresh every 30 seconds
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketStat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0">{label}</p>
      <p
        className={cn(
          "font-mono tabular-nums m-0 mt-0.5",
          small ? "text-[11px] font-medium" : "text-[12px] font-medium",
          tone === "green" && "text-green",
          tone === "red" && "text-red",
          !tone && "text-text"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] text-text-subtle uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-subtle">{label}</span>
      <span className="font-mono text-text">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-canvas border border-border rounded-md p-2">
      <p className="text-text-subtle m-0">{label}</p>
      <p className="font-mono text-text m-0 mt-0.5 text-[11px] font-medium">{value}</p>
    </div>
  );
}

function AiSignal({
  type,
  pair,
  msg,
  time,
}: {
  type: "up" | "down";
  pair: string;
  msg: string;
  time: string;
}) {
  const Icon = type === "up" ? ArrowUpRight : ArrowDownRight;
  const color = type === "up" ? "text-green" : "text-red";
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("w-3 h-3 mt-0.5 shrink-0", color)} />
      <div className="flex-1 min-w-0">
        <p className="m-0 text-text">
          <span className="font-mono text-[10px] text-text-muted mr-1">{pair}</span>
          {msg}
        </p>
      </div>
      <span className="text-text-subtle text-[10px] font-mono shrink-0">{time}</span>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "relative w-8 h-4 rounded-full transition",
        on ? "bg-gold" : "bg-card-elev"
      )}
      aria-pressed={on}
    >
      <span
        className={cn(
          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
          on ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
