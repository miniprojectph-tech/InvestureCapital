"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { useUserState } from "@/lib/useUserState";
import { FaqAnswer } from "@/components/faq/FaqAnswer";
import type { FaqItem } from "@/lib/faq";
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
 * offer). It sits just under the event pop-up, so when both are due the event
 * shows first and this one is waiting behind it. Skipped inside the
 * full-screen games.
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

  function dismiss() {
    if (current) markPromoSeen(current);
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
          onClick={dismiss}
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
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-card border border-gold/30 shadow-2xl"
          >
            <PromoCard promo={current} onDismiss={dismiss} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The card itself — also used by the admin preview. */
export function PromoCard({ promo, onDismiss }: { promo: Promo; onDismiss?: () => void }) {
  // The FAQ renderer already handles text markup, pictures, uploaded video and YouTube.
  const asFaq: FaqItem = {
    id: promo.id,
    question: promo.title,
    category: "",
    answer: promo.body,
    media: promo.media ? [promo.media] : [],
    status: "published",
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  };
  const href = promo.buttonHref.trim();
  const external = /^https?:\/\//i.test(href);
  const showButton = !!href && !!promo.buttonLabel.trim();
  const buttonClass = "w-full py-3 rounded-xl text-[13px] font-bold bg-gold text-gold-dark hover:brightness-110 transition flex items-center justify-center gap-2";

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <h2 className="font-display text-[20px] leading-tight m-0 text-text min-w-0 break-words">{promo.title || "Announcement"}</h2>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full bg-canvas text-text-muted flex items-center justify-center hover:text-text ring-1 ring-white/10">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-5 pb-5 pt-3 flex flex-col gap-4">
        <FaqAnswer item={asFaq} compact />

        {showButton && (
          external ? (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={onDismiss} className={buttonClass}>
              {promo.buttonLabel} <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <Link href={href.startsWith("/") ? href : `/${href}`} onClick={onDismiss} className={buttonClass}>
              {promo.buttonLabel} <ArrowRight className="w-4 h-4" />
            </Link>
          )
        )}

        {onDismiss && (
          <button type="button" onClick={onDismiss} className="self-center text-[11px] text-text-muted hover:text-text px-2 py-1">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
