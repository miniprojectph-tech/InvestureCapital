/**
 * Sticker packs are static files under /public/stickers/<pack>/<id>.<ext>,
 * served by Vercel's CDN. A sticker message stores only "<pack>/<id>", so
 * nothing is uploaded per send and Firebase never sees the image.
 *
 * To add art: drop 512×512 transparent WebP/PNG/SVG files into the pack folder
 * and list them here. Keep each under ~60 KB.
 */

export type Sticker = { id: string; file: string; label: string };
export type StickerPack = { id: string; name: string; icon: string; stickers: Sticker[] };

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "investure",
    name: "Investure pack",
    icon: "coin.svg",
    stickers: [
      { id: "coin", file: "coin.svg", label: "Peso coin" },
      { id: "rocket", file: "rocket.svg", label: "To the vault" },
      { id: "vault", file: "vault.svg", label: "Vault" },
      { id: "chart", file: "chart.svg", label: "Growing" },
      { id: "fire", file: "fire.svg", label: "On fire" },
      { id: "diamond", file: "diamond.svg", label: "Diamond hands" },
      { id: "gp100", file: "gp100.svg", label: "100 GP" },
      { id: "trophy", file: "trophy.svg", label: "Winner" },
      { id: "eye", file: "eye.svg", label: "Watching" },
      { id: "chat", file: "chat.svg", label: "Let's talk" },
      { id: "smile", file: "smile.svg", label: "Happy" },
      { id: "heart", file: "heart.svg", label: "Love it" },
    ],
  },
];

/** Matches the RTDB rule for the `sticker` field: "<pack>/<id>". */
export const STICKER_KEY_RE = /^[a-z0-9-]+\/[a-z0-9-]+$/;

export function findSticker(key: string | undefined): { pack: StickerPack; sticker: Sticker } | null {
  if (!key || !STICKER_KEY_RE.test(key)) return null;
  const [packId, id] = key.split("/");
  const pack = STICKER_PACKS.find((p) => p.id === packId);
  const sticker = pack?.stickers.find((s) => s.id === id);
  return pack && sticker ? { pack, sticker } : null;
}

export function stickerSrc(pack: StickerPack, sticker: Sticker): string {
  return `/stickers/${pack.id}/${sticker.file}`;
}

/** Quick-reaction bar (Messenger's six, with two Investure ones). */
export const QUICK_REACTIONS = ["❤️", "😆", "😮", "🔥", "💰", "👍"];

/** The emoji tab: a compact, curated set (no library, no network). */
export const EMOJI_GROUPS: { name: string; emojis: string[] }[] = [
  { name: "Smileys", emojis: ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤩", "🥳", "😉", "😋", "🤔", "🤗", "😴", "😅", "😭", "😢", "😡", "🤯", "😱", "🙄", "😏", "🤑", "🤞", "🙏", "👏", "🙌", "💪", "🫡"] },
  { name: "Money", emojis: ["💰", "💸", "💵", "🪙", "💎", "📈", "📉", "🏦", "🔒", "🔑", "🎯", "🏆", "🥇", "🎁", "🎉", "🎊", "🚀", "⭐", "✨", "🔥"] },
  { name: "Gestures", emojis: ["👍", "👎", "👌", "✌️", "🤝", "👋", "🫶", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯", "✅", "❌", "⚡", "☕", "🍀"] },
];
