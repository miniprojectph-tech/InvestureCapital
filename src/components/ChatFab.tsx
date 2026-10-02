"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useInboxMeta, isInboxUnread, useRoomLatest, readRoomSeenAt, markRoomSeen } from "@/lib/community";

/**
 * Floating chat button on every member page — a shortcut to the Community
 * page with a badge when there is something new.
 *
 *   red "1"  the admin replied in the member's private chat (opens that chat)
 *   dot      new messages in the Community Room since they last looked
 *
 * So it never sits on top of something the member needs: it can be dragged to
 * any spot along either edge (remembered on this device), and it slides away
 * while the page is being scrolled. Hidden inside the games and on the
 * Community page itself.
 */

const SIZE = 52;
const MARGIN = 12;
const POS_KEY = "investure.chatFab";
const DRAG_PX = 6; // movement beyond this is a drag, not a tap
type Pos = { side: "left" | "right"; /** distance from the bottom edge, px */ bottom: number };

function readPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "null") as Pos | null;
    return p && (p.side === "left" || p.side === "right") && Number.isFinite(p.bottom) ? p : null;
  } catch {
    return null;
  }
}

export function ChatFab() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, demoMode } = useAuth();

  const onCommunity = pathname.startsWith("/community");
  const inGame = pathname.startsWith("/tongits") || pathname.startsWith("/color-game") || pathname.startsWith("/play");
  const active = !!user && !demoMode && !inGame && !onCommunity;

  // ── what's new ──
  const inboxMeta = useInboxMeta(user && !demoMode ? user.uid : null);
  const adminUnread = isInboxUnread(inboxMeta, "user");
  const latest = useRoomLatest(!!user && !demoMode);
  const [seenAt, setSeenAt] = useState(0);
  // Being on the Community page counts as having seen the room.
  useEffect(() => {
    if (onCommunity) markRoomSeen();
    setSeenAt(readRoomSeenAt());
  }, [onCommunity, pathname, latest?.at]);
  const roomNew = !!latest && !!user && latest.uid !== user.uid && latest.at > seenAt;

  // ── position (draggable, remembered) ──
  const [pos, setPos] = useState<Pos>({ side: "right", bottom: 88 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null); // live top-left while dragging
  const start = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const saved = readPos();
    if (saved) setPos(saved);
    else if (window.matchMedia("(min-width: 768px)").matches) setPos({ side: "right", bottom: 24 });
  }, []);

  // Keep it on screen when the window is resized or the phone is rotated.
  useEffect(() => {
    const clamp = () => setPos((p) => ({ ...p, bottom: Math.max(MARGIN, Math.min(p.bottom, window.innerHeight - SIZE - MARGIN)) }));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    start.current = { px: e.clientX, py: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.px, e.clientY - s.py) < DRAG_PX) return;
    s.moved = true;
    const x = Math.max(MARGIN, Math.min(e.clientX - s.ox, window.innerWidth - SIZE - MARGIN));
    const y = Math.max(MARGIN, Math.min(e.clientY - s.oy, window.innerHeight - SIZE - MARGIN));
    setDrag({ x, y });
  }
  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!s) return;
    if (s.moved && drag) {
      // Snap to the nearer side edge; keep the height where it was dropped.
      const next: Pos = { side: drag.x + SIZE / 2 < window.innerWidth / 2 ? "left" : "right", bottom: window.innerHeight - drag.y - SIZE };
      setPos(next);
      setDrag(null);
      try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return;
    }
    setDrag(null);
    // A tap: open the chat — straight to the admin conversation when that is what's new.
    router.push(adminUnread ? "/community#admin" : "/community");
  }

  // ── slide away while the page is being scrolled ──
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    if (!active) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      setScrolling(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setScrolling(false), 700);
    };
    // capture: the page scrolls inside a panel on desktop, the window on phones
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => { document.removeEventListener("scroll", onScroll, { capture: true }); if (t) clearTimeout(t); };
  }, [active]);

  if (!active) return null;

  const hidden = scrolling && !drag;
  const style: React.CSSProperties = drag
    ? { left: drag.x, top: drag.y }
    : { [pos.side]: MARGIN + 4, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${pos.bottom}px)` };
  const label = adminUnread ? "Open chat — the admin replied" : roomNew ? "Open chat — new messages" : "Open chat";

  return (
    <button
      type="button"
      aria-label={label}
      title="Chat · drag to move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { start.current = null; setDrag(null); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(adminUnread ? "/community#admin" : "/community"); } }}
      className={cn(
        "fixed z-[45] rounded-full flex items-center justify-center select-none touch-none",
        "bg-[linear-gradient(135deg,#4F8EF7,#7B61FF)] text-white shadow-lg shadow-black/40 ring-1 ring-white/15",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        drag ? "cursor-grabbing scale-105" : "cursor-pointer transition-[transform,opacity] duration-300 motion-reduce:transition-none",
        hidden && (pos.side === "right" ? "translate-x-[140%] opacity-0 pointer-events-none" : "-translate-x-[140%] opacity-0 pointer-events-none"),
      )}
      style={{ width: SIZE, height: SIZE, ...style }}
    >
      <MessageCircle className="w-6 h-6" aria-hidden="true" />
      {adminUnread ? (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-canvas">1</span>
      ) : roomNew ? (
        <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-red ring-2 ring-canvas" />
      ) : null}
    </button>
  );
}
