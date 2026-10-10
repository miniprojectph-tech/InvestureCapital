# Game sound effects — generation list

Format for every clip: **mp3, 44.1 kHz, mono, around 128 kbps**, trimmed so the sound starts at once (no silence at the front), loudness about **−14 LUFS**, peaks under −1 dB. Keep each clip to the length given; the game cuts nothing. Name the file exactly as listed and drop it in:

- `public/sounds/slot/` for Dragon Spire
- `public/sounds/color/` for the Color Game
- `public/sounds/common/` for the shared ones

Prompts are written for a text-to-sound tool (ElevenLabs Sound Effects, Stable Audio, or similar). Add "no music, no voice, clean studio recording" to every prompt if the tool lets you.

## Common (both games)

| # | File | Length | Prompt |
|---|------|--------|--------|
| 1 | `common/tap.mp3` | 0.1 s | Soft UI tap, short wooden click, subtle, mobile app button |
| 2 | `common/toggle.mp3` | 0.15 s | Small mechanical switch flick, satisfying, dry |
| 3 | `common/count-tick.mp3` | 0.05 s | Single tiny tick for a number counting up, bright, very short, like a coin counter blip |
| 4 | `common/coin-shower.mp3` | 2.5 s | Dozens of gold coins pouring onto a marble table, rich metallic cascade, tapering off |
| 5 | `common/error.mp3` | 0.3 s | Gentle negative thud with a short low buzz, polite, not harsh |

## Dragon Spire (slot)

| # | File | Length | Prompt |
|---|------|--------|--------|
| 6 | `slot/spin-press.mp3` | 0.25 s | Heavy stone button pressed down with a deep thud and a faint metal latch, fantasy castle |
| 7 | `slot/reel-whir.mp3` | 1.5 s loop | Smooth continuous mechanical reel spinning with soft rhythmic clicks, loopable, no start or end, slot machine |
| 8 | `slot/reel-stop-1.mp3` | 0.2 s | Single slot reel stopping, firm mechanical clunk with a tiny metal ring, low pitch |
| 9 | `slot/reel-stop-2.mp3` | 0.2 s | Same reel stop, slightly higher pitch |
| 10 | `slot/reel-stop-3.mp3` | 0.2 s | Same reel stop, higher again |
| 11 | `slot/reel-stop-4.mp3` | 0.2 s | Same reel stop, higher again |
| 12 | `slot/reel-stop-5.mp3` | 0.25 s | Same reel stop, highest, with a short bright ring at the end |
| 13 | `slot/symbol-burst.mp3` | 0.4 s | Magical crystal shattering into sparkles, bright glassy pop with a short shimmer tail |
| 14 | `slot/cascade-1.mp3` | 0.5 s | Rising magical chime, three notes going up, soft bells, fantasy |
| 15 | `slot/cascade-2.mp3` | 0.5 s | Same rising chime a step higher in pitch, slightly brighter |
| 16 | `slot/cascade-3.mp3` | 0.6 s | Same rising chime higher again with a sparkle layer |
| 17 | `slot/cascade-4.mp3` | 0.7 s | Same rising chime at its highest with a triumphant shimmer and a soft gong |
| 18 | `slot/orb-merge.mp3` | 0.8 s | Energy orbs merging, deep magical hum rising to a bright pulse, arcane power |
| 19 | `slot/win-small.mp3` | 0.6 s | Short pleasant win jingle, two bells and a soft coin clink, modest |
| 20 | `slot/win-big.mp3` | 2.0 s | Triumphant fantasy fanfare, brass and bells, medium length, celebratory |
| 21 | `slot/win-mega.mp3` | 3.0 s | Big epic fanfare with orchestral hit, choir swell and coins, grand casino celebration |
| 22 | `slot/win-epic.mp3` | 4.0 s | Massive dragon roar followed by an epic orchestral fanfare and a long coin cascade, legendary jackpot moment |
| 23 | `slot/hw-trigger.mp3` | 1.2 s | Deep ceremonial drum hit with a rising magical riser, something big is starting, tension |
| 24 | `slot/hw-coin-land.mp3` | 0.3 s | Single heavy gold medallion dropping onto stone and settling, solid metallic clink |
| 25 | `slot/hw-respin.mp3` | 0.4 s | Short magical whoosh for a quick respin, airy, fast |
| 26 | `slot/hw-heartbeat.mp3` | 1.0 s loop | Slow tense heartbeat, two beats, loopable, low and muffled |
| 27 | `slot/jackpot-mini.mp3` | 1.5 s | Bright jackpot stinger, bells and a cymbal, small celebration |
| 28 | `slot/jackpot-minor.mp3` | 2.0 s | Jackpot stinger bigger than mini, brass hit with bells and a short coin spill |
| 29 | `slot/jackpot-major.mp3` | 3.0 s | Big jackpot stinger, orchestral hit, choir, long bells, heavy coin spill |
| 30 | `slot/jackpot-grand.mp3` | 5.0 s | Grand jackpot, dragon roar, thunder, full orchestral fanfare, bells, endless coin cascade, the biggest moment in the game |
| 31 | `slot/ambience.mp3` | 20 s loop | Quiet dragon lair ambience, distant wind in a stone hall, faint embers crackling, very subtle, loopable |

## Color Game

| # | File | Length | Prompt |
|---|------|--------|--------|
| 32 | `color/chip-place.mp3` | 0.25 s | Casino chip placed firmly on a felt table, single clack |
| 33 | `color/chip-other.mp3` | 0.2 s | Casino chip placed on felt, softer and further away, someone else's bet |
| 34 | `color/countdown-tick.mp3` | 0.15 s | Clock tick for a countdown, wooden, clear, slightly urgent |
| 35 | `color/bets-closed.mp3` | 0.6 s | Dealer's bell ding, single bright hand bell, bets are closed |
| 36 | `color/dice-rattle.mp3` | 1.2 s | Three dice rattling inside a leather cup, shaking rhythm, casino |
| 37 | `color/dice-land-1.mp3` | 0.25 s | One die tumbling onto a felt table and settling, short |
| 38 | `color/dice-land-2.mp3` | 0.25 s | One die landing on felt, slightly different bounce |
| 39 | `color/dice-land-3.mp3` | 0.3 s | One die landing on felt with a final settle |
| 40 | `color/win-1.mp3` | 0.8 s | Small cheerful win, short bell and a coin clink, one match |
| 41 | `color/win-2.mp3` | 1.5 s | Happy win jingle with coins and a small crowd cheer, two matches |
| 42 | `color/win-3.mp3` | 2.5 s | Big win, crowd cheering, brass fanfare, coins pouring, three matches |
| 43 | `color/lose.mp3` | 0.6 s | Soft descending two-note tone, gentle disappointment, not harsh |
| 44 | `color/jackpot-siren.mp3` | 4.0 s | Casino jackpot alarm, bright siren whoop with bells and a crowd roar, celebratory not scary |
| 45 | `color/rank-up.mp3` | 0.7 s | Quick rising success sting, climbing a rank, bright and short |
| 46 | `color/ambience.mp3` | 20 s loop | Quiet casino floor murmur, distant chips and soft chatter, very subtle, loopable |

## Notes

- Numbers 8 to 12 and 14 to 17 are the same sound at rising pitches. If the tool can't do that, generate one and I'll pitch the rest in code.
- The two ambience loops are optional and off by default; players can turn them on.
- Loops (7, 26, 31, 46) must start and end at silence or at the same waveform so they don't click when repeating.
