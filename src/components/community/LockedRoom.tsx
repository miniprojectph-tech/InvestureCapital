"use client";

import { Lock } from "lucide-react";

// A made-up conversation, blurred. Nothing from the real room is ever sent to
// people outside it (the rules refuse it), so there is nothing real to un-blur.
const FAKE: { own: boolean; w: string; h?: number }[] = [
  { own: false, w: "52%" },
  { own: true, w: "64%", h: 150 },
  { own: false, w: "38%" },
  { own: false, w: "70%", h: 48 },
  { own: true, w: "46%" },
  { own: false, w: "58%" },
  { own: true, w: "62%", h: 120 },
  { own: false, w: "44%" },
];

/** What someone not added to an exclusive room sees when they open it. */
export function LockedRoom({ name }: { name: string }) {
  return (
    <div className="relative bg-card border border-border rounded-xl overflow-hidden" style={{ height: "calc(100dvh - var(--chat-offset, 235px))", minHeight: 460 }} aria-label={`${name} is locked`}>
      <div className="absolute inset-0 p-4 flex flex-col gap-3 blur-[8px] opacity-70 select-none pointer-events-none" aria-hidden="true">
        {FAKE.map((b, i) => (
          <div
            key={i}
            className={b.own ? "self-end rounded-[18px] bg-[linear-gradient(135deg,#4F8EF7,#7B61FF)]" : "self-start rounded-[18px] bg-[#232B45]"}
            style={{ width: b.w, height: b.h ?? 32 }}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-canvas/30 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#F5C66B]/15 border border-[#F5C66B]/40 flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#F5C66B]" />
        </div>
        <p className="text-[16px] font-bold m-0">{name}</p>
        <p className="text-[13px] text-text-muted m-0 max-w-[280px]">This room is exclusive for {name} members.</p>
      </div>
    </div>
  );
}
