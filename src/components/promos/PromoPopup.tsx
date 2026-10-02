"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight, Play } from "lucide-react";
import { useUserState } from "@/lib/useUserState";
import { FaqAnswer } from "@/components/faq/FaqAnswer";
import { formatDuration, type FaqItem, type FaqMedia } from "@/lib/faq";
import {
  usePromos,
  promoHasContent,
  promoInWindow,
  promoMatchesAudience,
  shouldShowPromo,
  markPromoSeen,
  type Promo,
} from "@/lib/promos";

/**
 * Promotional pop-up shown after sign-in (a how-to video, an announcement, an
 * offer) — the same kind of card as the event pop-up. It sits just under the
 * event pop-up, so when both are due the event shows first and this one is
 * waiting behind it. Skipped inside the full-screen games.
 */
export function PromoPopup() {
  const pathname = usePathname();
  const { promos } = usePromos();
  const { state } = useUserState();
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<Promo | null>(null);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const inGame = pathname.startsWith("/tongits") || pathname.startsWith("/color-game") || pathname.startsWith("/play");
  const hasActive = (state?.placements?.length ?? 0) > 0;
  const stateReady = !!state;

  const due = useMemo(
    () => promos.filter((p) => p.status === "live" && promoHasContent(p) && promoInWindow(p, now) && promoMatchesAudience(p, hasActive)),
    [promos, now, hasActive],
  );

  // Pick the first pop-up this device hasn't seen (per its frequency). Wait for
  // the member's record so "no placement yet" ads aren't shown to investors.
  useEffect(() => {
    if (current || inGame || !stateReady) return;
    const next = due.find((p) => shouldShowPromo(p, shown.current));
    if (next) {
      shown.current.add(next.id);
      setCurrent(next);
    }
  }, [due, current, inGame, stateReady]);

  function dismiss(never = false) {
    if (current) markPromoSeen(current, never);
    setCurrent(null);
  }

  return (
    <AnimatePresence>
      {current && !inGame && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[58] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => dismiss()}
          role="dialog"
          aria-modal="true"
          aria-label={current.title || "Announcement"}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-card border border-gold/40 shadow-2xl"
          >
            <PromoCard promo={current} onDismiss={dismiss} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Picture / uploaded video / YouTube, full width at the top of the card like an event banner. */
function PromoMedia({ media }: { media: FaqMedia }) {
  const [playing, setPlaying] = useState(false);

  if (media.kind === "image") {
    // Shown whole, at its own aspect ratio, so nothing baked into the art is cropped.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={media.url} alt={media.caption ?? ""} className="block w-full h-auto" />;
  }

  const poster = media.kind === "youtube" && media.videoId ? `https://i.ytimg.com/vi/${media.videoId}/hqdefault.jpg` : media.poster;
  return (
    <div className="relative w-full aspect-video bg-black">
      {playing ? (
        media.kind === "youtube" && media.videoId ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.videoId}?autoplay=1`}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <video src={media.url} poster={media.poster} controls autoPlay playsInline className="absolute inset-0 w-full h-full bg-black" />
        )
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full" aria-label="Play video">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="w-full h-full object-cover opacity-90" />
          ) : (
            <span className="block w-full h-full bg-card-elev" />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-black/60 border border-white/30 flex items-center justify-center">
              <Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" />
            </span>
          </span>
          {media.duration ? <span className="absolute bottom-2 right-2 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">{formatDuration(media.duration)}</span> : null}
        </button>
      )}
    </div>
  );
}

/** The card itself — also used by the admin preview. Laid out like the event card: banner, title, text, button. */
export function PromoCard({ promo, onDismiss }: { promo: Promo; onDismiss?: (never?: boolean) => void }) {
  // The FAQ renderer handles the text markup (paragraphs, bullets, bold, links).
  const textOnly: FaqItem = { id: promo.id, question: promo.title, category: "", answer: promo.body, media: [], status: "published", createdAt: promo.createdAt, updatedAt: promo.updatedAt };
  const href = promo.buttonHref.trim();
  const external = /^https?:\/\//i.test(href);
  const showButton = !!href && !!promo.buttonLabel.trim();
  const buttonClass = "w-full py-3 rounded-xl text-[13px] font-bold bg-gold text-gold-dark hover:brightness-110 transition flex items-center justify-center gap-2";

  return (
    <div className="flex flex-col">
      {/* banner */}
      <div className="relative overflow-hidden rounded-t-3xl bg-canvas">
        {promo.media ? (
          // key: a different video must start fresh, not keep the old one playing
          <PromoMedia key={promo.media.url} media={promo.media} />
        ) : (
          <div className="h-24" style={{ background: "radial-gradient(120% 90% at 20% 10%, #3DD59855, transparent 60%), radial-gradient(90% 90% at 90% 90%, #4F8EF755, transparent 60%), #0E1A2C" }} />
        )}
        {onDismiss && (
          <button onClick={() => onDismiss()} aria-label="Close" className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-text flex items-center justify-center hover:bg-black/80 ring-1 ring-white/15">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-5 pb-5 pt-4 flex flex-col gap-3">
        {promo.title.trim() && <h2 className="font-display text-[22px] leading-tight m-0 text-text break-words">{promo.title}</h2>}
        {promo.body.trim() && <FaqAnswer item={textOnly} compact />}

        {showButton && (
          external ? (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => onDismiss?.()} className={buttonClass}>
              {promo.buttonLabel} <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <Link href={href.startsWith("/") ? href : `/${href}`} onClick={() => onDismiss?.()} className={buttonClass}>
              {promo.buttonLabel} <ArrowRight className="w-4 h-4" />
            </Link>
          )
        )}

        {onDismiss && (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[10px] text-text-subtle">
              <input type="checkbox" onChange={(e) => { if (e.target.checked) onDismiss(true); }} /> Don&apos;t show again
            </label>
            <button type="button" onClick={() => onDismiss()} className="text-[11px] text-text-muted hover:text-text px-2 py-1">Maybe later</button>
          </div>
        )}
      </div>
    </div>
  );
}
