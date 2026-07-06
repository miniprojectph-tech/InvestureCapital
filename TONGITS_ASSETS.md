# Community Tongits — Art Assets

Drop finished files into **`public/tongits/`** using the **exact filenames** below.
Everything is wired with graceful fallbacks: missing files degrade to a clean CSS/
icon look, so partial delivery is fine and the game already looks like a game before
any art lands.

**Theme:** cohesive with the app — dark navy (`#060a14`), emerald `#3DD598`,
vault purple `#A78BFA`, soft gold `#F5C66B`. A *dark* felt, not bright casino green.

**Formats:** WebP for large/background images, transparent PNG for overlays/icons.
Card aspect ratio is 5:7. Design mobile-first (must read in portrait).

**Cards are CSS-rendered** — you do NOT need 52 card faces. Only the card *back*.

## Tier 1 — biggest impact
| Filename | Size | Transparent | Purpose |
|---|---|---|---|
| `table-bg.webp` | 1600×1000 (or 1080×1920) | no | The felt play surface behind the table |
| `card-back.webp` | 300×420 | no | Back design for the stock pile + opponents' hidden hands |
| `logo.png` | 800×300 | yes | "Tongits" wordmark on the lobby hero |
| `chip.png` | 128×128 | yes | Game-Points coin/chip icon |
| `win-banner.png` | 1000×600 | yes | "Tongits!" splash on the result screen (shown on a Tongits win) |

## Tier 2 — polish
| Filename | Size | Transparent | Purpose |
|---|---|---|---|
| `seat-frame.png` | 220×220 | yes | Avatar ring around each seat |
| `seat-frame-active.png` | 220×220 | yes | Glowing ring for the player whose turn it is |
| `jackpot.png` | 256×256 | yes | Pot / chip-stack graphic for the jackpot |
| `lobby-bg.webp` | 1600×500 | no | Background behind the lobby hero band |
| `felt-empty-seat.png` | 180×180 | yes | "Waiting for player" seat placeholder |

## Tier 3 — optional
- **Full 52-card faces** (`cards/AS.webp … cards/KC.webp`, 300×420) — only if you want
  fully custom cards; otherwise the CSS cards stay. (Wiring would be added on request.)
- **Audio** (`deal.mp3`, `draw.mp3`, `discard.mp3`, `win.mp3`) — short SFX, optional.

## Where each asset appears (code)
- Slots registered in `src/components/AssetImage.tsx` (`TONGITS_ART`).
- Cards: `src/components/PlayingCard.tsx` (card back uses `card-back.webp`).
- Table felt + stock/discard/jackpot/seats: `src/components/TongitsTable.tsx`.
- Lobby hero (logo + bg): `src/app/(app)/tongits/page.tsx`.
- Win banner: the result screen in `src/app/(app)/tongits/room/[code]/page.tsx`.
