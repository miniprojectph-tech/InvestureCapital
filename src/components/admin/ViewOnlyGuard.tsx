"use client";

import { useEffect, useRef, useState } from "react";
import { EyeOff } from "lucide-react";

/**
 * Wraps a member screen shown to an admin and makes it look-but-don't-touch.
 *
 * Every click, key activation, form submit and field change inside it is
 * stopped before the page's own handlers can run — so no button can place,
 * withdraw, save or navigate. The only controls that still work are the ones a
 * page marks `data-viewas-ok`: local, harmless things like a filter, a search
 * box or an export. Blocking is the default, so a control nobody thought about
 * is simply inert rather than accidentally live.
 *
 * A link to one of `screens` ("/referrals", "/plans", …) is never followed — it
 * would open the admin's OWN page. It is handed to `onOpenScreen`, which shows
 * that screen of the member being viewed. Every other link stays inert.
 *
 * Scrolling and selecting text are untouched.
 */
// Member routes that only redirect to another screen.
const SCREEN_ALIAS: Record<string, string> = { activity: "transactions" };

export function ViewOnlyGuard<K extends string>({ screens, onOpenScreen, children }: { screens: readonly K[]; onOpenScreen: (screen: K) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const allowed = (target: EventTarget | null) => target instanceof Element && !!target.closest("[data-viewas-ok]");
    // Things that look pressable — only used to decide when to show the "view only" hint.
    const pressable = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("a, button, input, select, textarea, label, summary, [role='button'], [role='tab'], [role='link']");

    const screenLinkedFrom = (target: EventTarget | null): K | undefined => {
      const href = target instanceof Element ? target.closest("a[href]")?.getAttribute("href") : null;
      // only same-app paths of exactly one segment: "/referrals", "/plans?x=1"
      const name = href?.match(/^\/([a-z-]+)\/?(?:[?#].*)?$/)?.[1];
      return name ? screens.find((s) => s === (SCREEN_ALIAS[name] ?? name)) : undefined;
    };

    // Stopped outright (the page never hears about them, and the browser doesn't act on them).
    // EVERY click is stopped, not just clicks on buttons: a page can make any element clickable,
    // and an element nobody thought about must be inert, not live.
    const block = (e: Event) => {
      if (allowed(e.target)) return;
      if (e.type === "keydown") {
        const k = (e as KeyboardEvent).key;
        if (k !== "Enter" && k !== " ") return; // arrow keys, Tab, typing: harmless
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "click" || (e.type === "keydown" && (e as KeyboardEvent).key === "Enter")) {
        const screen = screenLinkedFrom(e.target);
        if (screen) {
          onOpenScreen(screen);
          return;
        }
      }
      if ((e.type === "click" && pressable(e.target)) || e.type === "submit") {
        setNudge(true);
        if (t) clearTimeout(t);
        t = setTimeout(() => setNudge(false), 1600);
      }
    };
    // Press-style events: hidden from the page's handlers, but NOT cancelled, so the browser
    // can still scroll, select text and move the caret.
    const hide = (e: Event) => {
      if (allowed(e.target)) return;
      e.stopPropagation();
    };

    // Capture phase on the wrapper: runs before React's handlers at the root ever see the event.
    const blocked = ["click", "dblclick", "auxclick", "submit", "keydown", "change", "input", "paste", "drop", "contextmenu"] as const;
    const hidden = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"] as const;
    for (const type of blocked) el.addEventListener(type, block, true);
    for (const type of hidden) el.addEventListener(type, hide, true);
    return () => {
      for (const type of blocked) el.removeEventListener(type, block, true);
      for (const type of hidden) el.removeEventListener(type, hide, true);
      if (t) clearTimeout(t);
    };
  }, [screens, onOpenScreen]);

  return (
    <div ref={ref} className="relative">
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`fixed left-1/2 -translate-x-1/2 bottom-6 z-[80] px-3.5 py-2 rounded-full bg-card border border-border-strong shadow-xl text-[11px] text-text flex items-center gap-1.5 transition-opacity duration-200 pointer-events-none ${nudge ? "opacity-100" : "opacity-0"}`}
      >
        <EyeOff className="w-3.5 h-3.5 text-[#F5C66B]" /> View only — nothing can be changed from here
      </div>
    </div>
  );
}
