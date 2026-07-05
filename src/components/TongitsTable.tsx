"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Clock, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useGameState,
  useMyHand,
  draw,
  takeDiscard,
  meld,
  sapawCard,
  discard,
  callTongits,
  enforceTimeout,
  cardLabel,
  isRedSuit,
  type Card as TCard,
} from "@/lib/tongits-game";
import type { TongitsRoom as Room } from "@/lib/tongits";

function CardChip({
  card,
  selected,
  onClick,
  small,
}: {
  card: TCard;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-md border font-mono font-semibold flex items-center justify-center shrink-0 transition select-none",
        small ? "w-7 h-9 text-[11px]" : "w-9 h-12 text-[13px]",
        "bg-white",
        isRedSuit(card) ? "text-red-600" : "text-neutral-900",
        selected ? "border-gold ring-2 ring-gold -translate-y-1" : "border-neutral-300",
        onClick && "hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      {cardLabel(card)}
    </button>
  );
}

function MeldRow({
  melds,
  clickable,
  onPick,
}: {
  melds: TCard[][];
  clickable?: boolean;
  onPick?: (meldIndex: number) => void;
}) {
  if (!melds || melds.length === 0) return <span className="text-[10px] text-text-subtle">no melds</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {melds.map((m, i) => (
        <button
          key={i}
          onClick={() => clickable && onPick?.(i)}
          disabled={!clickable}
          className={cn(
            "flex gap-0.5 p-1 rounded-md border",
            clickable ? "border-gold/50 hover:bg-gold/10 cursor-pointer" : "border-border"
          )}
        >
          {m.map((c) => (
            <CardChip key={c} card={c} small />
          ))}
        </button>
      ))}
    </div>
  );
}

export function TongitsTable({ code, room }: { code: string; room: Room }) {
  const { user } = useAuth();
  const gs = useGameState(code);
  const myHand = useMyHand(code, user?.uid ?? null);
  const [selected, setSelected] = useState<TCard[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const enforcedFor = useRef(0);

  // 1s clock for the turn timer + timeout enforcement.
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!gs || gs.status !== "in_game") return;
    if (tick > gs.turnDeadline + 1500 && enforcedFor.current !== gs.turnDeadline) {
      enforcedFor.current = gs.turnDeadline;
      enforceTimeout(code).catch(() => {});
    }
  }, [tick, gs, code]);

  // Drop selections that are no longer in hand (e.g. after a move lands).
  useEffect(() => {
    setSelected((sel) => sel.filter((c) => myHand.includes(c)));
  }, [myHand]);

  if (!gs) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
      </div>
    );
  }

  const uid = user?.uid ?? "";
  const isMyTurn = gs.turnUid === uid;
  const secondsLeft = Math.max(0, Math.ceil((gs.turnDeadline - tick) / 1000));
  const discardTop = gs.discard[gs.discard.length - 1];
  const others = gs.seats.filter((s) => s.uid !== uid);
  const iHaveMeld = (gs.melds[uid]?.length ?? 0) > 0;

  function toggle(card: TCard) {
    setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
  }

  async function act(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Move failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSapaw(targetUid: string, meldIndex: number) {
    if (selected.length !== 1) return;
    await act("sapaw", () => sapawCard(code, targetUid, meldIndex, selected[0]));
  }

  const canTakeDiscard = isMyTurn && gs.phase === "draw" && !!discardTop && selected.length >= 2;
  const sapawMode = isMyTurn && gs.phase === "discard" && selected.length === 1;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">{error}</div>
      )}

      {/* Opponents */}
      <div className="grid grid-cols-2 gap-3">
        {others.map((o) => (
          <div
            key={o.uid}
            className={cn(
              "rounded-xl border p-3",
              gs.turnUid === o.uid ? "border-gold bg-gold/5" : "border-border bg-card"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium truncate">{o.name}</span>
              <span className="text-[10px] text-text-subtle font-mono">{gs.handCounts[o.uid] ?? 0} cards</span>
            </div>
            <MeldRow melds={gs.melds[o.uid] ?? []} clickable={sapawMode} onPick={(mi) => onSapaw(o.uid, mi)} />
          </div>
        ))}
      </div>

      {/* Center: stock / discard / jackpot / timer */}
      <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <div className="w-9 h-12 rounded-md bg-vault/20 border border-vault/40 flex items-center justify-center">
              <Layers className="w-4 h-4 text-vault" />
            </div>
            <span className="text-[9px] text-text-subtle">stock {gs.stockCount}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            {discardTop ? (
              <CardChip card={discardTop} />
            ) : (
              <div className="w-9 h-12 rounded-md border border-dashed border-border" />
            )}
            <span className="text-[9px] text-text-subtle">discard</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {gs.jackpotPoints > 0 && (
            <div className="flex items-center gap-1.5 text-vault">
              <Sparkles className="w-4 h-4" />
              <span className="text-[13px] font-mono font-medium">{gs.jackpotPoints}</span>
              <span className="text-[9px] text-text-subtle">jackpot</span>
            </div>
          )}
          <div className={cn("flex items-center gap-1.5", secondsLeft <= 5 ? "text-red" : "text-text-muted")}>
            <Clock className="w-4 h-4" />
            <span className="text-[15px] font-mono font-medium tabular-nums">{secondsLeft}s</span>
          </div>
        </div>
      </div>

      {/* Turn banner */}
      <div
        className={cn(
          "px-3 py-2 rounded-lg text-[12px] text-center",
          isMyTurn ? "bg-green/15 text-green font-medium" : "bg-card-elev text-text-muted"
        )}
      >
        {isMyTurn
          ? gs.phase === "draw"
            ? "Your turn — draw from the stock, or take the discard to meld."
            : "Your turn — meld, sapaw, call, or discard to end."
          : `Waiting for ${gs.seats.find((s) => s.uid === gs.turnUid)?.name ?? "player"}…`}
      </div>

      {/* My melds */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-2">Your melds</p>
        <MeldRow melds={gs.melds[uid] ?? []} clickable={sapawMode} onPick={(mi) => onSapaw(uid, mi)} />
      </div>

      {/* My hand */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0">
            Your hand · {myHand.length} {sapawMode ? "· tap a meld to sapaw" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {myHand.map((c) => (
            <CardChip key={c} card={c} selected={selected.includes(c)} onClick={() => toggle(c)} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {isMyTurn && gs.phase === "draw" && (
          <>
            <ActionBtn label="Draw from stock" tone="green" busy={busy === "draw"} onClick={() => act("draw", () => draw(code))} />
            <ActionBtn
              label="Take discard + meld"
              tone="gold"
              disabled={!canTakeDiscard}
              busy={busy === "take"}
              onClick={() => act("take", () => takeDiscard(code, [...selected, discardTop]))}
            />
          </>
        )}
        {isMyTurn && gs.phase === "discard" && (
          <>
            <ActionBtn
              label={`Meld (${selected.length})`}
              tone="gold"
              disabled={selected.length < 3}
              busy={busy === "meld"}
              onClick={() => act("meld", () => meld(code, selected))}
            />
            <ActionBtn
              label="Discard"
              tone="green"
              disabled={selected.length !== 1}
              busy={busy === "discard"}
              onClick={() => act("discard", () => discard(code, selected[0]))}
            />
            <ActionBtn
              label="Call (Tumba)"
              tone="vault"
              disabled={!iHaveMeld}
              busy={busy === "call"}
              onClick={() => act("call", () => callTongits(code))}
            />
          </>
        )}
      </div>
      <p className="text-[10px] text-text-subtle m-0">
        Select cards, then act. Meld = 3+ (set or same-suit run). Sapaw = select one card and tap an exposed meld.
        Discard your last card (or meld out) to hit <span className="text-gold">Tongits</span>.
      </p>
    </div>
  );
}

function ActionBtn({
  label,
  tone,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  tone: "green" | "gold" | "vault";
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const cls =
    tone === "green"
      ? "bg-green text-white"
      : tone === "gold"
      ? "bg-gold text-gold-dark"
      : "bg-vault text-vault-dark";
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "px-4 py-2.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed",
        cls
      )}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {label}
    </button>
  );
}
