"use client";

import { useState } from "react";
import { Clock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { STICKER_PACKS, EMOJI_GROUPS, stickerSrc } from "@/lib/stickers";

const RECENT_KEY = "investure.recentStickers";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberSticker(key: string) {
  try {
    const next = [key, ...readRecent().filter((k) => k !== key)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

/** Emoji grid shared by the tray's Emoji tab and the "more reactions" picker. */
export function EmojiGrid({ onPick, compact }: { onPick: (emoji: string) => void; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {EMOJI_GROUPS.map((g) => (
        <div key={g.name}>
          {!compact && <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle m-0 mb-1 px-1">{g.name}</p>}
          <div className={cn("grid gap-0.5", compact ? "grid-cols-8" : "grid-cols-8 sm:grid-cols-10")}>
            {g.emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                className="h-9 rounded-lg text-[22px] leading-none hover:bg-card-elev active:scale-95 transition"
                aria-label={`Emoji ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  /** Sticker tapped → sent immediately. */
  onSticker: (key: string) => void;
  /** Emoji tapped → inserted into the composer. */
  onEmoji: (emoji: string) => void;
};

export function StickerTray({ onSticker, onEmoji }: Props) {
  const [tab, setTab] = useState<"stickers" | "emoji">("stickers");
  const [packId, setPackId] = useState<string>("recent");
  const [search, setSearch] = useState("");
  const [recent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecent()));

  const activePack = STICKER_PACKS.find((p) => p.id === packId) ?? null;
  const q = search.trim().toLowerCase();
  const items = (() => {
    if (q) {
      return STICKER_PACKS.flatMap((p) => p.stickers.filter((s) => s.label.toLowerCase().includes(q) || s.id.includes(q)).map((s) => ({ pack: p, sticker: s })));
    }
    if (activePack) return activePack.stickers.map((s) => ({ pack: activePack, sticker: s }));
    // Recent (falls back to the first pack when nothing was used yet)
    const rec = recent
      .map((key) => {
        const [pid, sid] = key.split("/");
        const pack = STICKER_PACKS.find((p) => p.id === pid);
        const sticker = pack?.stickers.find((s) => s.id === sid);
        return pack && sticker ? { pack, sticker } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return rec.length ? rec : STICKER_PACKS[0].stickers.map((s) => ({ pack: STICKER_PACKS[0], sticker: s }));
  })();

  return (
    <div className="border-t border-border bg-card flex flex-col" style={{ height: 300 }}>
      <div className="flex justify-center gap-7 border-b border-border">
        {(["stickers", "emoji"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition", tab === t ? "text-text border-blue" : "text-text-muted border-transparent hover:text-text")}
          >
            {t === "stickers" ? "Stickers" : "Emoji"}
          </button>
        ))}
      </div>

      {tab === "stickers" ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                aria-label="Search stickers"
                className="w-28 h-8 bg-canvas border border-border rounded-full pl-8 pr-2 text-[11px] text-text outline-none focus:border-blue/50 placeholder:text-text-subtle"
              />
            </div>
            <button
              type="button"
              onClick={() => { setPackId("recent"); setSearch(""); }}
              aria-label="Recent stickers"
              className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition", packId === "recent" && !q ? "border-blue bg-blue/10 text-blue" : "border-transparent text-text-muted hover:bg-card-elev")}
            >
              <Clock className="w-4 h-4" />
            </button>
            {STICKER_PACKS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPackId(p.id); setSearch(""); }}
                aria-label={p.name}
                className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition bg-canvas", packId === p.id && !q ? "border-blue" : "border-transparent hover:border-border-strong")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/stickers/${p.id}/${p.icon}`} alt="" className="w-6 h-6" />
              </button>
            ))}
            <span className="ml-auto text-[10px] text-text-subtle truncate">{q ? "Search results" : activePack?.name ?? "Recent"}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {items.length === 0 ? (
              <p className="text-[11px] text-text-subtle text-center py-8 m-0">No stickers match.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
                {items.map(({ pack, sticker }) => (
                  <button
                    key={`${pack.id}/${sticker.id}`}
                    type="button"
                    onClick={() => onSticker(`${pack.id}/${sticker.id}`)}
                    className="aspect-square rounded-xl flex items-center justify-center hover:bg-card-elev active:scale-95 transition p-2"
                    aria-label={`Send sticker: ${sticker.label}`}
                    title={sticker.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stickerSrc(pack, sticker)} alt="" loading="lazy" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <EmojiGrid onPick={onEmoji} />
        </div>
      )}
    </div>
  );
}
