"use client";

import { useState } from "react";

/**
 * Renders an <img>, but falls back to `fallback` if the file is missing (404)
 * or fails to load. Lets us pre-wire uploaded art slots (public/tongits/*) that
 * light up when the file exists and quietly degrade to a CSS/icon fallback when
 * it doesn't. `src` of null/"" renders the fallback immediately.
 */
export function AssetImage({
  src,
  alt,
  className,
  fallback = null,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

/** Central registry of Tongits art slots (drop files into /public/tongits/). */
export const TONGITS_ART = {
  lobbyFull: "/tongits/lobby-full.png", // full baked lobby art (interactive overlay)
  waitingRoom: "/tongits/waiting-room.png", // baked waiting-room art (interactive overlay)
  tableBg: "/tongits/table-bg.webp",
  cardBack: "/tongits/card-back.webp",
  logo: "/tongits/logo.png",
  chip: "/tongits/chip.png",
  winBanner: "/tongits/win-banner.png",
  seatFrame: "/tongits/seat-frame.png",
  seatFrameActive: "/tongits/seat-frame-active.png",
  jackpot: "/tongits/jackpot.png",
  lobbyBg: "/tongits/lobby-bg.webp",
  emptySeat: "/tongits/felt-empty-seat.png",
} as const;
