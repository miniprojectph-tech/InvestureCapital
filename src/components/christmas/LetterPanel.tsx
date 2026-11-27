"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Gift, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSound } from "@/lib/sound";
import {
  boardTiles, lettersHeld, missingLetters, wordComplete, xmasTrade, xmasRedeem, xmasSetLoadNumber,
  SPARE_COST, XMAS_WORD, type CollectResult, type XmasGift, type XmasPlayer,
} from "@/lib/christmas";

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^FirebaseError:\s*/, "") || "Something went wrong. Try again.";
};

const STATUS_TEXT: Record<XmasGift["status"], string> = {
  credited: "Added",
  needs_number: "Enter your number",
  to_send: "Being sent",
  sent: "Sent",
};

function Tile({ letter, on, fresh, big }: { letter: string; on: boolean; fresh?: boolean; big?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-extrabold select-none",
        big ? "w-[52px] h-[60px] text-[32px] rounded-[10px]" : "w-[27px] h-[33px] text-[15px] border",
        on || big ? "bg-[#F5C66B] text-[#3b2a06] border-[#F5C66B]" : "bg-canvas text-text-subtle border-border",
        fresh && "animate-[xmas-pop_0.6s_ease]",
      )}
    >
      {on || big ? letter : "?"}
    </span>
  );
}

/**
 * The CHRISTMAS board inside Santa's card: today's letter(s), the word, spares,
 * trading, redeeming, and the mobile number for a load gift.
 */
export function LetterPanel({
  player, collect, canRedeem, gifts, today,
}: {
  player: XmasPlayer | null;
  /** What happened when the room opened today (null while asking). */
  collect: CollectResult | null;
  canRedeem: boolean;
  gifts: XmasGift[];
  today: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ text: string; gift: XmasGift | null } | null>(null);
  const [mobile, setMobile] = useState("");
  const [editNumber, setEditNumber] = useState(false);
  const shuffle = useRef<number | null>(null);
  useEffect(() => () => { if (shuffle.current) window.clearInterval(shuffle.current); }, []);

  const p = player ?? collect?.player ?? null;
  const have = p?.have;
  const tiles = boardTiles(have);
  const held = lettersHeld(have);
  const spares = p?.spares ?? 0;
  const missing = missingLetters(have);
  const complete = wordComplete(have);
  const fresh = collect?.status === "new" ? collect.drawn ?? [] : [];
  const todays = p?.today?.day === today ? p.today.letters : [];
  const loadGift = gifts.find((g) => g.kind === "load" && (g.status === "needs_number" || g.status === "to_send"));

  const trade = async (letter: string) => {
    setBusy(`trade-${letter}`); setErr(null);
    try { await xmasTrade(letter); getSound().play("xmas/card", { volume: 0.6 }); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const redeem = async () => {
    setBusy("redeem"); setErr(null);
    const labels = ["Game Points", "Wallet credit", "Mobile load"];
    let i = 0;
    setReveal({ text: labels[0], gift: null });
    shuffle.current = window.setInterval(() => { i += 1; setReveal({ text: labels[i % labels.length], gift: null }); }, 90);
    try {
      const r = await xmasRedeem();
      const pool = r.labels.length ? r.labels : labels;
      if (shuffle.current) window.clearInterval(shuffle.current);
      let n = 0;
      shuffle.current = window.setInterval(() => {
        n += 1;
        if (n > 12) {
          if (shuffle.current) window.clearInterval(shuffle.current);
          shuffle.current = null;
          setReveal({ text: r.gift.label, gift: r.gift });
          getSound().play("xmas/card");
          setBusy(null);
          return;
        }
        setReveal({ text: pool[n % pool.length], gift: null });
      }, 90);
    } catch (e) {
      if (shuffle.current) window.clearInterval(shuffle.current);
      shuffle.current = null;
      setReveal(null); setErr(errText(e)); setBusy(null);
    }
  };
  const saveNumber = async (giftId: string) => {
    setBusy("number"); setErr(null);
    try { await xmasSetLoadNumber(giftId, mobile); setEditNumber(false); setMobile(""); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  if (collect?.status === "suspended") return null;

  return (
    <div className="mt-4 text-left">
      {/* today's letter */}
      {fresh.length > 0 ? (
        <div className="text-center">
          <p className="m-0 mb-2 text-[12px] text-text-muted">
            {collect?.double ? "Double letter day! Today's letters" : "Today's letter"}
            {collect?.repeats ? <><br /><span className="text-[11px]">{collect.repeats === fresh.length && fresh.length === 1 ? "You have it already, so it's saved as a spare." : "A repeat is saved as a spare."}</span></> : null}
          </p>
          <div className="flex justify-center gap-2.5">{fresh.map((l, i) => <Tile key={i} letter={l} on big fresh />)}</div>
        </div>
      ) : collect?.status === "no-plan" ? (
        <p className="m-0 text-center text-[12px] text-text-muted">
          Christmas letters are for members with an active plan. <Link href="/plans" className="text-[#F5C66B] underline">Start a plan</Link> to collect one every day.
        </p>
      ) : todays.length > 0 ? (
        <p className="m-0 text-center text-[12px] text-text-muted">
          Today&apos;s {todays.length > 1 ? "letters" : "letter"}: <span className="font-bold text-[#F5C66B]">{todays.join(" ")}</span> <Check className="inline w-3.5 h-3.5 text-green -mt-0.5" /> Come back tomorrow for the next one.
        </p>
      ) : collect === null ? (
        <p className="m-0 text-center text-[12px] text-text-muted flex items-center justify-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Opening your present…</p>
      ) : null}

      {/* the word */}
      {(p || collect?.status === "new") && (
        <>
          <div className="flex justify-center gap-1 mt-3" aria-label={`${held} of ${XMAS_WORD.length} letters`}>
            {tiles.map((t, i) => <Tile key={i} letter={t.letter} on={t.on} fresh={t.on && fresh.includes(t.letter)} />)}
          </div>
          <p className="m-0 mt-1.5 text-center text-[12px] text-text-muted">
            {complete ? "Word complete!" : `${held} of ${XMAS_WORD.length} letters`}{spares ? ` · ${spares} spare${spares === 1 ? "" : "s"}` : ""}
          </p>
        </>
      )}

      {/* trade spares */}
      {canRedeem && spares >= SPARE_COST && missing.length > 0 && !reveal && (
        <div className="mt-3 rounded-xl border border-border bg-canvas px-3 py-2.5">
          <p className="m-0 text-[12px] text-text">Trade {SPARE_COST} spares for a letter:</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {missing.map((l) => (
              <button key={l} type="button" disabled={!!busy} onClick={() => trade(l)} className="min-w-9 h-9 px-2 rounded-lg border border-[#F5C66B]/50 text-[#F5C66B] text-[14px] font-bold hover:bg-[#F5C66B]/10 disabled:opacity-50">
                {busy === `trade-${l}` ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* redeem */}
      {reveal ? (
        <div className="mt-3 rounded-xl border border-green/40 bg-green/10 px-3 py-3 text-center">
          <p className="m-0 text-[12px] text-green">{reveal.gift ? "Your gift" : "Santa is choosing…"}</p>
          <p className="m-0 mt-0.5 text-[22px] font-extrabold text-text">{reveal.text}</p>
          {reveal.gift && (
            <p className="m-0 mt-0.5 text-[12px] text-text-muted">
              {reveal.gift.kind === "points" ? "Added to your Game Points." : reveal.gift.kind === "wallet" ? "Added to your wallet." : "Enter your mobile number below and we'll send it."}
            </p>
          )}
          {reveal.gift && <button type="button" onClick={() => setReveal(null)} className="mt-2 text-[12px] text-text-muted underline">Start the next word</button>}
        </div>
      ) : complete && canRedeem ? (
        <button type="button" disabled={!!busy} onClick={redeem} className="mt-3 w-full h-11 rounded-xl bg-[#F5C66B] text-[#2A1D05] text-[14px] font-bold flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60">
          <Gift className="w-4 h-4" /> Redeem my gift
        </button>
      ) : complete ? (
        <p className="m-0 mt-2 text-center text-[12px] text-text-muted">Gifts can no longer be redeemed.</p>
      ) : null}

      {/* load gift: the member's number */}
      {loadGift && (loadGift.status === "needs_number" || editNumber) ? (
        <form className="mt-3 rounded-xl border border-border bg-canvas px-3 py-2.5" onSubmit={(e) => { e.preventDefault(); void saveNumber(loadGift.id); }}>
          <label className="block text-[12px] text-text" htmlFor="xmas-mobile">Your {loadGift.label}: which mobile number should we send it to?</label>
          <div className="flex gap-2 mt-2">
            <input id="xmas-mobile" inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" value={mobile} onChange={(e) => { setMobile(e.target.value); setErr(null); }} className="flex-1 min-w-0 bg-card border border-border rounded-lg px-3 py-2 text-[14px] text-text outline-none focus:border-[#F5C66B]/60" />
            <button type="submit" disabled={busy === "number" || !mobile.trim()} className="px-3 rounded-lg bg-gold text-gold-dark text-[13px] font-semibold disabled:opacity-50">
              {busy === "number" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </form>
      ) : loadGift ? (
        <p className="m-0 mt-3 text-[12px] text-text-muted text-center">
          Your {loadGift.label} is being sent to <span className="text-text font-semibold">{loadGift.mobile}</span>.{" "}
          <button type="button" onClick={() => { setEditNumber(true); setMobile(loadGift.mobile ?? ""); }} className="underline">Change number</button>
        </p>
      ) : null}

      {err && <p className="m-0 mt-2 text-center text-[12px] text-red">{err}</p>}

      {/* recent gifts */}
      {gifts.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="m-0 text-[11px] text-text-subtle">Your Christmas gifts</p>
          {gifts.slice(0, 3).map((g) => (
            <div key={g.id} className="flex items-center justify-between text-[12px] mt-1">
              <span className="text-text">{g.label}</span>
              <span className={g.status === "needs_number" ? "text-[#F5A524]" : "text-text-muted"}>{STATUS_TEXT[g.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
