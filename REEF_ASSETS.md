# Investure Reef — Asset generation spec

Everything below is uploadable in **Admin → Fish & config → Game assets**
(and per-fish in the fish editor). Deliver **transparent PNG** unless noted;
export at **2× / retina**. Animated items: **seamless loop, muted**.

Keep one consistent art style + lighting across all assets (generate with the
same style prompt/seed) — that's what makes it read as "one premium game".

---

## 1. Background / environment  (biggest visual payoff)
Pick **ONE** of these three ways to do the backdrop:

| Asset | Dimensions | Format | Notes / movement |
|---|---|---|---|
| **Full background (still)** | 2048×1536 (4:3) | JPG/PNG | Single painted seascape. Simplest. |
| **Full background (video loop)** | 1920×1080 | MP4 or WebM, <8 MB | 8–12 s **seamless** loop, muted. Movement: gentle water shimmer, slow drifting clouds, subtle waves, faint light rays. |
| **Parallax layers** (optional, advanced) | each 2048×1536 | transparent PNG | 4 stacked layers: `sky`, `far sea/horizon`, `near water`, `foreground deck`. Lets the scene move in depth. |

Composition tip: leave the **center-right open water** clear (that's where the
lure lands) and keep interest in the **foreground corners** (deck, vines, coral).

---

## 2. Fishing gear
| Asset | Dimensions | Format | Movement |
|---|---|---|---|
| **Rod** | 512×1024 (tall) | transparent PNG | Diagonal, tip top-right. Optional bend animation later. |
| **Lure / bobber** | 128×128 | transparent PNG (or animated WebP/GIF) | If animated: gentle bob loop, 1–2 s. |

---

## 3. Fish  (uploaded per-species in the fish editor)
| Asset | Dimensions | Format | Movement |
|---|---|---|---|
| **Fish portrait** (reveal + collection) | 512×512 | transparent PNG | Side profile, centered, soft rim light, no background. |
| **Fish swim loop** (optional) | 512×512 | animated **WebP** or GIF | 1–2 s seamless swim/idle loop, transparent. |
| **Legendary/Mythic extra** (optional) | 512×512 | animated WebP | Glow pulse or a leap; more drama = rarer. |

Do all fish with the **same prompt scaffold** so the set matches. Name files by
species so they're easy to upload.

---

## 4. Rarity frames  (per tier — uploaded on each rarity row)
| Asset | Dimensions | Format | Notes |
|---|---|---|---|
| **Rarity frame ×5** | 256×256 | transparent PNG (9-sliceable) | Ornate borders escalating by tier: Common=bronze, Rare=blue steel, Epic=violet crystal, Legendary=gold, Mythic=prismatic/animated. |

---

## 5. Catch reveal FX
| Asset | Dimensions | Format | Movement |
|---|---|---|---|
| **God-rays burst** | 1024×1024 | transparent PNG | Radial light rays; the app spins it behind the fish. |
| **Sparkle/confetti** (optional) | 512×512 | transparent PNG or sprite sheet | Bursts on Legendary+. |
| **Splash** (optional) | 512×256 | transparent PNG or WebP | Water splash when the lure lands. |

---

## 6. UI kit  (optional — the "ornate gold" premium feel)
| Asset | Dimensions | Format | Notes |
|---|---|---|---|
| **Panel frame** | 256×256 | transparent PNG | 9-slice; ~48 px ornate corners. |
| **Button (normal/pressed)** | 256×96 ×2 | transparent PNG | 9-slice. |
| **Round icon-button frame** | 128×128 | transparent PNG | For Cast / Tasks / Gallery / Ranking. |

---

## 7. Identity
| Asset | Dimensions | Format |
|---|---|---|
| **Reef logo / wordmark** | 1024×512 | transparent PNG |
| **App icon** | 1024×1024 | PNG (no transparency) |
| **Loading art** | 1920×1080 | JPG/PNG |

---

## 8. Audio  (can't be image-generated — source or generate separately)
| Asset | Format | Notes |
|---|---|---|
| **Ambient ocean loop** | MP3, ~30–60 s loop | Plays quietly in the scene. |
| **Cast whoosh** | MP3, <1 s | On cast release. |
| **Splash** | MP3, <1 s | On lure landing. |
| **Bite alert** | MP3, <1 s | When a fish bites. |
| **Catch fanfare** | MP3, 1–2 s | On reveal (louder for rarer). |
| **UI click** | MP3, <0.3 s | Buttons. |
| **Music loop** | MP3, 1–2 min loop | Optional background track. |

---

### Delivery checklist
- Transparent PNG, 2× resolution, trimmed (no extra padding).
- Animations: seamless loop, muted, WebP/GIF (visual) or MP4/WebM (background video).
- Consistent style + lighting across the whole set.
- Upload in **Admin → Fish & config → Game assets** (global) and the **fish editor** (per fish).
