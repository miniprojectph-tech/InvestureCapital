"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useGameState,
  useMyHand,
  draw as cfDraw,
  takeDiscard as cfTakeDiscard,
  meld as cfMeld,
  sapawCard as cfSapawCard,
  discard as cfDiscard,
  callTongits as cfCallTongits,
  enforceTimeout as cfEnforceTimeout,
  type Card as TCard,
} from "@/lib/tongits-game";
import { useTongitsWs } from "@/lib/tongits-ws";
import type { TongitsRoom as Room } from "@/lib/tongits";
import { PlayingCard } from "./PlayingCard";
import { AssetImage, TONGITS_ART } from "./AssetImage";

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length === 1 ? p[0].slice(0, 2) : (p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
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
  if (!melds || melds.length === 0)
    return <span className="text-[10px] text-white/30">no melds yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {melds.map((m, i) => (
        <button
          key={i}
          onClick={() => clickable && onPick?.(i)}
          disabled={!clickable}
          className={cn(
            "flex gap-0.5 p-1 rounded-md transition",
            clickable ? "bg-[#3DD598]/15 ring-1 ring-[#3DD598]/60 hover:bg-[#3DD598]/25 cursor-pointer" : ""
          )}
        >
          {m.map((c) => (
            <PlayingCard key={c} card={c} size="sm" />
          ))}
        </button>
      ))}
    </div>
  );
}

function Seat({
  name,
  count,
  active,
  melds,
  sapawMode,
  onSapaw,
}: {
  name: string;
  count: number;
  active: boolean;
  melds: TCard[][];
  sapawMode: boolean;
  onSapaw: (mi: number) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 border transition backdrop-blur-sm",
        active ? "border-[#3DD598] bg-[#3DD598]/10" : "border-white/10 bg-black/20"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="relative w-9 h-9 shrink-0">
          <div
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold",
              active ? "bg-[#3DD598]/25 text-[#3DD598]" : "bg-white/10 text-white/70"
            )}
          >
            {initials(name)}
          </div>
          <AssetImage
            src={active ? TONGITS_ART.seatFrameActive : TONGITS_ART.seatFrame}
            alt=""
            className="absolute -inset-1 w-11 h-11 pointer-events-none"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-white truncate m-0">{name}</p>
          <p className="text-[10px] text-white/40 m-0">{count} cards</p>
        </div>
        {/* fan of face-down cards */}
        <div className="flex -space-x-4 shrink-0">
          {Array.from({ length: Math.min(count, 5) }, (_, i) => (
            <PlayingCard key={i} size="sm" faceDown />
          ))}
        </div>
      </div>
      <MeldRow melds={melds} clickable={sapawMode} onPick={onSapaw} />
    </div>
  );
}

export function TongitsTable({ code }: { code: string; room: Room }) {
  const { user } = useAuth();
  const uid_ = user?.uid ?? null;

  const fsGs = useGameState(code);
  const fsHand = useMyHand(code, uid_);

  const [error, setError] = useState<string | null>(null);
  const wsHook = useTongitsWs(code, uid_, (msg) => setError(msg));
  const wsActive = wsHook.connected && wsHook.gs?.status === "in_game";

  const gs = (wsActive ? wsHook.gs : null) || fsGs;
  const myHand = wsActive ? wsHook.hand : fsHand;

  const draw = wsActive ? wsHook.draw : (async () => { await cfDraw(code); });
  const takeDiscard = wsActive ? wsHook.takeDiscard : (async (mc: TCard[]) => { await cfTakeDiscard(code, mc); });
  const meld = wsActive ? wsHook.meld : (async (cs: TCard[]) => { await cfMeld(code, cs); });
  const sapawCard = wsActive
    ? (async (tu: string, mi: number, c: TCard) => { await wsHook.sapaw(tu, mi, c); })
    : (async (tu: string, mi: number, c: TCard) => { await cfSapawCard(code, tu, mi, c); });
  const discard_ = wsActive ? wsHook.discard : (async (c: TCard) => { await cfDiscard(code, c); });
  const callTongits = wsActive ? wsHook.call : (async () => { await cfCallTongits(code); });
  const enforceTimeout = wsActive ? wsHook.enforceTimeout : (async () => { await cfEnforceTimeout(code); });

  const [selected, setSelected] = useState<TCard[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const enforcedFor = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!gs || gs.status !== "in_game") return;
    if (tick > gs.turnDeadline + 1500 && enforcedFor.current !== gs.turnDeadline) {
      enforcedFor.current = gs.turnDeadline;
      enforceTimeout().catch(() => {});
    }
  }, [tick, gs, code]);

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
    await act("sapaw", () => sapawCard(targetUid, meldIndex, selected[0]));
  }

  const canTakeDiscard = isMyTurn && gs.phase === "draw" && !!discardTop && selected.length >= 2;
  const sapawMode = isMyTurn && gs.phase === "discard" && selected.length === 1;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">{error}</div>
      )}

      {/* Felt table */}
      <div
        className="rounded-2xl p-3 sm:p-4 relative overflow-hidden flex flex-col gap-3"
        style={{
          backgroundColor: "#0a1c17",
          backgroundImage: `radial-gradient(130% 100% at 50% -10%, rgba(61,213,152,0.12), transparent 55%), url(${TONGITS_ART.tableBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "inset 0 0 90px rgba(0,0,0,0.65)",
          border: "1px solid rgba(61,213,152,0.16)",
        }}
      >
        {/* Opponents */}
        <div className="grid grid-cols-2 gap-3">
          {others.map((o) => (
            <Seat
              key={o.uid}
              name={o.name}
              count={gs.handCounts[o.uid] ?? 0}
              active={gs.turnUid === o.uid}
              melds={gs.melds[o.uid] ?? []}
              sapawMode={sapawMode}
              onSapaw={(mi) => onSapaw(o.uid, mi)}
            />
          ))}
        </div>

        {/* Center: stock / discard / jackpot / timer */}
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-end gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <PlayingCard size="lg" faceDown />
                <span className="absolute -bottom-1 -right-1 bg-black/70 text-white text-[9px] font-mono rounded px-1">
                  {gs.stockCount}
                </span>
              </div>
              <span className="text-[9px] text-white/40 flex items-center gap-1">
                <Layers className="w-2.5 h-2.5" /> stock
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              {discardTop ? (
                <PlayingCard card={discardTop} size="lg" />
              ) : (
                <div className="w-[58px] h-[81px] rounded-[13px] border border-dashed border-white/20" />
              )}
              <span className="text-[9px] text-white/40">discard</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {gs.jackpotPoints > 0 && (
              <div className="flex items-center gap-1.5">
                <AssetImage
                  src={TONGITS_ART.jackpot}
                  alt=""
                  className="w-5 h-5"
                  fallback={<span className="text-[#A78BFA]">✦</span>}
                />
                <span className="text-[14px] font-mono font-semibold text-[#A78BFA]">{gs.jackpotPoints}</span>
                <span className="text-[9px] text-white/40">jackpot</span>
              </div>
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                secondsLeft <= 5 ? "bg-red/20 text-red" : "bg-black/30 text-white/70"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[14px] font-mono font-semibold tabular-nums">{secondsLeft}s</span>
            </div>
          </div>
        </div>

        {/* Turn banner */}
        <div
          className={cn(
            "px-3 py-2 rounded-lg text-[12px] text-center",
            isMyTurn ? "bg-[#3DD598]/20 text-[#3DD598] font-medium" : "bg-black/25 text-white/50"
          )}
        >
          {isMyTurn
            ? gs.phase === "draw"
              ? "Your turn — draw from the stock, or take the discard to meld."
              : "Your turn — meld, sapaw, call, or discard to end."
            : `Waiting for ${gs.seats.find((s) => s.uid === gs.turnUid)?.name ?? "player"}…`}
        </div>

        {/* My melds */}
        <div className="rounded-xl bg-black/20 border border-white/10 p-3">
          <p className="text-[10px] text-white/40 uppercase tracking-wider m-0 mb-2">Your melds</p>
          <MeldRow melds={gs.melds[uid] ?? []} clickable={sapawMode} onPick={(mi) => onSapaw(uid, mi)} />
        </div>
      </div>

      {/* My hand */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[10px] text-text-subtle uppercase tracking-wider m-0 mb-2">
          Your hand · {myHand.length}
          {sapawMode ? " · tap an exposed meld to sapaw" : ""}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {myHand.map((c) => (
            <PlayingCard key={c} card={c} selected={selected.includes(c)} onClick={() => toggle(c)} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {isMyTurn && gs.phase === "draw" && (
          <>
            <ActionBtn label="Draw from stock" tone="green" busy={busy === "draw"} onClick={() => act("draw", () => draw())} />
            <ActionBtn
              label="Take discard + meld"
              tone="gold"
              disabled={!canTakeDiscard}
              busy={busy === "take"}
              onClick={() => act("take", () => takeDiscard([...selected, discardTop]))}
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
              onClick={() => act("meld", () => meld(selected))}
            />
            <ActionBtn
              label="Discard"
              tone="green"
              disabled={selected.length !== 1}
              busy={busy === "discard"}
              onClick={() => act("discard", () => discard_(selected[0]))}
            />
            <ActionBtn
              label="Call (Tumba)"
              tone="vault"
              disabled={!iHaveMeld}
              busy={busy === "call"}
              onClick={() => act("call", () => callTongits())}
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
