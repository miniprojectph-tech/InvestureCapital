"use client";

import { useState } from "react";
import {
  Loader2,
  Sparkles,
  Wallet,
  Gift,
  Ticket,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useGameState } from "@/lib/game";
import {
  useRewards,
  useRedemptions,
  redeemReward,
  REWARD_TYPE_LABELS,
  type Reward,
  type RedemptionStatus,
} from "@/lib/rewards";

const typeIcon = { wallet: Wallet, gadget: Gift, activity: Ticket };

const statusMeta: Record<RedemptionStatus, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  fulfilled: { label: "Fulfilled", icon: CheckCircle2, color: "text-green", bg: "bg-green/15" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red", bg: "bg-red/15" },
};

export default function RewardsPage() {
  const { demoMode } = useAuth();
  const { state } = useGameState();
  const { rewards, loading } = useRewards();
  const { rows: redemptions } = useRedemptions("me");

  const [selected, setSelected] = useState<Reward | null>(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<"confirm" | "processing" | "done" | "error">("confirm");
  const [error, setError] = useState<string | null>(null);

  const points = state?.points ?? 0;
  const activeRewards = rewards.filter((r) => r.active);

  function openRedeem(r: Reward) {
    setSelected(r);
    setNote("");
    setStage("confirm");
    setError(null);
  }

  async function confirmRedeem() {
    if (!selected) return;
    if (demoMode) {
      setError("Redeeming isn't available in demo mode.");
      setStage("error");
      return;
    }
    setStage("processing");
    try {
      await redeemReward(selected.id, note.trim() || undefined);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Redemption failed");
      setStage("error");
    }
  }

  return (
    <div>
      <TopHeader title="Rewards" subtitle="Exchange your Reef points" />

      <Card className="mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-vault/15 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-vault" />
          </div>
          <div>
            <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">Your points</p>
            <p className="text-[24px] font-mono font-medium m-0 leading-none tabular-nums text-vault">
              {points.toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 text-gold animate-spin" />
        </div>
      ) : activeRewards.length === 0 ? (
        <Card className="text-center py-10 text-[12px] text-text-subtle">
          No rewards available yet — check back soon.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          {activeRewards.map((r) => {
            const Icon = typeIcon[r.type];
            const affordable = points >= r.cost;
            const soldOut = typeof r.stock === "number" && r.stock <= 0;
            return (
              <Card key={r.id} className="flex flex-col">
                {r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt={r.name} className="w-full h-28 object-cover rounded-lg mb-2" />
                ) : (
                  <div className="w-full h-28 rounded-lg mb-2 bg-canvas flex items-center justify-center">
                    <Icon className="w-8 h-8 text-text-subtle" />
                  </div>
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-card-elev text-text-muted">
                    {REWARD_TYPE_LABELS[r.type]}
                  </span>
                  {typeof r.stock === "number" && (
                    <span className="text-[9px] text-text-subtle">{r.stock} left</span>
                  )}
                </div>
                <p className="text-[13px] font-medium m-0">{r.name}</p>
                {r.description && (
                  <p className="text-[10px] text-text-subtle m-0 mt-0.5 flex-1">{r.description}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[13px] font-mono text-vault">{r.cost.toLocaleString()} pts</span>
                  <button
                    onClick={() => openRedeem(r)}
                    disabled={!affordable || soldOut}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-gold text-gold-dark font-medium hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {soldOut ? "Sold out" : affordable ? "Redeem" : "Not enough"}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader title={`My redemptions (${redemptions.length})`} />
        {redemptions.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-6 m-0">
            No redemptions yet. Spend your points above.
          </p>
        ) : (
          redemptions.map((row, i) => {
            const meta = statusMeta[row.status];
            const Icon = meta.icon;
            return (
              <div
                key={row.id}
                className={cn(
                  "flex items-center gap-3 py-2.5",
                  i < redemptions.length - 1 && "border-b border-border"
                )}
              >
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.bg)}>
                  <Icon className={cn("w-4 h-4", meta.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] m-0 truncate">{row.rewardName}</p>
                  <p className="text-[10px] text-text-subtle m-0 mt-0.5">
                    {new Date(row.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    {" · "}
                    {row.cost.toLocaleString()} pts
                    {row.note && <span className="text-text-dim"> · {row.note}</span>}
                  </p>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-medium", meta.bg, meta.color)}>
                  {meta.label}
                </span>
              </div>
            );
          })
        )}
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Redeem reward">
        {selected && stage === "confirm" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-3 py-2.5 bg-canvas border border-border rounded-lg">
              <span className="text-[12px]">{selected.name}</span>
              <span className="text-[12px] font-mono text-vault">{selected.cost.toLocaleString()} pts</span>
            </div>
            {selected.type === "wallet" ? (
              <p className="text-[11px] text-text-muted m-0">
                Credits <span className="text-green font-mono">{formatPHP(selected.walletAmount ?? 0)}</span> to your
                wallet instantly.
              </p>
            ) : (
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
                  Delivery note / contact (optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Address, phone, or preferred time"
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-lg text-[13px] text-text outline-none focus:border-gold/40"
                />
                <p className="text-[10px] text-text-subtle mt-1.5 m-0">
                  An admin will process and fulfill this manually.
                </p>
              </div>
            )}
            <p className="text-[10px] text-text-subtle m-0">
              Balance after: <span className="font-mono">{(points - selected.cost).toLocaleString()} pts</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmRedeem}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-medium bg-gold text-gold-dark hover:brightness-110 transition"
              >
                Confirm redeem
              </button>
            </div>
          </div>
        )}
        {stage === "processing" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 text-gold animate-spin" />
            <p className="text-[12px] text-text-muted m-0">Redeeming…</p>
          </div>
        )}
        {stage === "done" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green" />
            </div>
            <p className="text-[14px] font-medium m-0">Redeemed!</p>
            <p className="text-[11px] text-text-muted m-0">
              {selected?.type === "wallet"
                ? "Wallet credited instantly."
                : "Your request is pending — an admin will fulfill it."}
            </p>
            <button
              onClick={() => setSelected(null)}
              className="mt-2 px-5 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium"
            >
              Done
            </button>
          </div>
        )}
        {stage === "error" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red/15 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red" />
            </div>
            <p className="text-[14px] font-medium m-0">Couldn&apos;t redeem</p>
            <p className="text-[11px] text-text-muted m-0">{error}</p>
            <button
              onClick={() => setStage("confirm")}
              className="mt-2 px-5 py-2 bg-card-elev border border-border-strong rounded-lg text-[12px]"
            >
              Try again
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
