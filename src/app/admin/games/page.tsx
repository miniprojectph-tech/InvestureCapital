"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Save, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { uploadGameImage, uploadGameAsset, describeStorageError } from "@/lib/storage";
import {
  useGameConfig,
  useGamesSettings,
  saveGamesSettings,
  useFish,
  saveGameConfig,
  saveFish,
  deleteFish,
  seedFishIfEmpty,
  reseedFish,
  DEFAULT_GAME_CONFIG,
  type GameConfig,
  type GameAssets,
  type GamesSettings,
  type Fish,
} from "@/lib/game";

function assetKind(url?: string): "video" | "audio" | "image" {
  if (!url) return "image";
  const u = url.toLowerCase();
  if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return "video";
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/.test(u)) return "audio";
  return "image";
}

const A_IMG = "image/*";
const A_VID = "video/*";
const A_AUD = "audio/*";
const A_BG = "image/*,video/*";

type AssetGroup = {
  title: string;
  fields: { key: keyof GameAssets; label: string; hint?: string; accept: string }[];
};

// Every uploadable game asset, grouped. Keys match GameAssets. Categories mirror
// REEF_ASSETS.xlsx. Items beyond the "Now"-wired ones are stored for Phase 2/3.
const ASSET_GROUPS: AssetGroup[] = [
  {
    title: "Background",
    fields: [
      { key: "bgFull", label: "Background (image)", hint: "2048×1536", accept: A_IMG },
      { key: "bgVideo", label: "Background (video)", hint: "1920×1080", accept: A_VID },
      { key: "hud", label: "HUD overlay skin", hint: "16:9", accept: A_IMG },
      { key: "bgSky", label: "Layer · sky", accept: A_IMG },
      { key: "bgSea", label: "Layer · far sea", accept: A_IMG },
      { key: "bgWater", label: "Layer · near water", accept: A_IMG },
      { key: "bgForeground", label: "Layer · foreground", accept: A_IMG },
    ],
  },
  {
    title: "Gear & rod states",
    fields: [
      { key: "rod", label: "Rod (static)", hint: "512×1024", accept: A_IMG },
      { key: "lure", label: "Lure / bobber", hint: "128×128", accept: A_IMG },
      { key: "rodIdle", label: "Rod · idle", accept: A_IMG },
      { key: "rodCasting", label: "Rod · casting", accept: A_IMG },
      { key: "rodBendLight", label: "Rod bend · light", accept: A_IMG },
      { key: "rodBendMedium", label: "Rod bend · medium", accept: A_IMG },
      { key: "rodBendExtreme", label: "Rod bend · extreme", accept: A_IMG },
      { key: "lineSnap", label: "Line snap FX", accept: A_IMG },
    ],
  },
  {
    title: "Fishing line",
    fields: [
      { key: "lineNormal", label: "Line · normal", accept: A_IMG },
      { key: "lineTight", label: "Line · tight", accept: A_IMG },
      { key: "lineDanger", label: "Line · danger", accept: A_IMG },
      { key: "lineBroken", label: "Line · broken", accept: A_IMG },
    ],
  },
  {
    title: "Bite / hook FX",
    fields: [
      { key: "fxNibble", label: "Small nibble ripple", accept: A_IMG },
      { key: "fxBigBite", label: "Big bite splash", accept: A_IMG },
      { key: "fxBobberPull", label: "Bobber pulled under", accept: A_IMG },
      { key: "fxPerfectHook", label: "Perfect Hook FX", accept: A_IMG },
      { key: "fxFishEscaped", label: "Fish Escaped FX", accept: A_IMG },
    ],
  },
  {
    title: "Reeling UI",
    fields: [
      { key: "uiTensionMeter", label: "Tension meter", accept: A_IMG },
      { key: "uiStaminaBar", label: "Fish stamina bar", accept: A_IMG },
      { key: "uiReelButton", label: "Reel button", accept: A_IMG },
      { key: "uiPullLeft", label: "Pull-left indicator", accept: A_IMG },
      { key: "uiPullRight", label: "Pull-right indicator", accept: A_IMG },
      { key: "uiDangerWarning", label: "Danger zone warning", accept: A_IMG },
      { key: "uiPerfectZone", label: "Perfect timing zone", accept: A_IMG },
    ],
  },
  {
    title: "Reveal FX",
    fields: [
      { key: "revealRays", label: "God-rays burst", hint: "1024×1024", accept: A_IMG },
      { key: "fxSparkle", label: "Sparkle / confetti", accept: A_IMG },
      { key: "splash", label: "Splash FX", accept: A_IMG },
    ],
  },
  {
    title: "Environment / weather",
    fields: [
      { key: "envSunny", label: "Sunny day", accept: A_BG },
      { key: "envSunset", label: "Sunset", accept: A_BG },
      { key: "envNight", label: "Night", accept: A_BG },
      { key: "envRain", label: "Rain overlay", accept: A_BG },
      { key: "envStorm", label: "Storm overlay", accept: A_BG },
      { key: "envFog", label: "Fog overlay", accept: A_BG },
      { key: "envGoldenOcean", label: "Golden Ocean event", accept: A_BG },
    ],
  },
  {
    title: "Live events",
    fields: [
      { key: "eventFothBanner", label: "Fish of the Hour banner", accept: A_IMG },
      { key: "eventLegendaryAlert", label: "Legendary Spawn Alert", accept: A_IMG },
      { key: "eventTournament", label: "Tournament Started", accept: A_IMG },
      { key: "eventWorldBoss", label: "World Boss / Kraken", accept: A_BG },
      { key: "eventWinnerScreen", label: "Leaderboard winner screen", accept: A_IMG },
    ],
  },
  {
    title: "Progression icons",
    fields: [
      { key: "iconCoins", label: "Coins", accept: A_IMG },
      { key: "iconGems", label: "Gems", accept: A_IMG },
      { key: "iconXp", label: "XP", accept: A_IMG },
      { key: "iconChest", label: "Treasure chest", accept: A_IMG },
      { key: "iconBait", label: "Bait", accept: A_IMG },
      { key: "iconRodUpgrade", label: "Rod upgrade", accept: A_IMG },
      { key: "iconCollectionBook", label: "Collection book", accept: A_IMG },
    ],
  },
  {
    title: "Identity",
    fields: [
      { key: "logo", label: "Logo / wordmark", hint: "1024×512", accept: A_IMG },
      { key: "appIcon", label: "App icon", hint: "1024×1024", accept: A_IMG },
      { key: "loadingArt", label: "Loading art", accept: A_IMG },
    ],
  },
  {
    title: "Audio",
    fields: [
      { key: "ambientAudio", label: "Ambient loop", accept: A_AUD },
      { key: "castSfx", label: "Cast SFX", accept: A_AUD },
      { key: "biteSfx", label: "Bite SFX", accept: A_AUD },
      { key: "catchSfx", label: "Catch SFX", accept: A_AUD },
      { key: "uiClick", label: "UI click", accept: A_AUD },
      { key: "music", label: "Music loop", accept: A_AUD },
    ],
  },
];

export default function AdminGamesPage() {
  const { user } = useAuth();
  const { config, loading } = useGameConfig();
  const { fish } = useFish();

  const [draft, setDraft] = useState<GameConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // General (cross-game) settings
  const { settings: gamesSettings } = useGamesSettings();
  const [univDraft, setUnivDraft] = useState<GamesSettings | null>(null);
  const [savingUniv, setSavingUniv] = useState(false);

  // Fish editor
  const [editing, setEditing] = useState<Fish | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!loading && !draft) setDraft(config);
  }, [loading, config, draft]);
  useEffect(() => {
    if (univDraft === null) setUnivDraft(gamesSettings);
  }, [gamesSettings, univDraft]);

  if (loading || !draft) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  async function saveConfig() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin || !draft) return;
    setSavingCfg(true);
    setError(null);
    setMsg(null);
    try {
      await saveGameConfig(db, draft);
      setMsg("Game config saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingCfg(false);
    }
  }

  async function saveUniversal() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin || !univDraft) return;
    setSavingUniv(true);
    setError(null);
    setMsg(null);
    try {
      await saveGamesSettings(db, {
        universalDailyCredits: Math.max(0, Math.round(univDraft.universalDailyCredits)),
      });
      setMsg("General settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingUniv(false);
    }
  }

  async function seed() {
    const { db } = getFirebase();
    if (!db) return;
    try {
      const n = await seedFishIfEmpty(db);
      setMsg(n > 0 ? `Seeded ${n} sea creatures.` : "Fish already exist — nothing seeded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    }
  }

  async function reload() {
    const { db } = getFirebase();
    if (!db) return;
    if (!confirm("Replace ALL current fish with the generated art set (53 creatures)? This deletes existing fish docs.")) return;
    try {
      const n = await reseedFish(db);
      setMsg(`Loaded ${n} generated sea creatures.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reload failed");
    }
  }

  async function updateAsset(key: keyof GameAssets, url: string) {
    if (!draft) return;
    const assets = { ...(draft.assets ?? {}) };
    if (url) assets[key] = url;
    else delete assets[key];
    setDraft({ ...draft, assets });
    const { db } = getFirebase();
    if (db) await saveGameConfig(db, { assets });
    setMsg(url ? "Asset saved." : "Asset removed.");
  }

  async function updateRarityFrame(i: number, url: string) {
    if (!draft) return;
    const rarities = [...draft.rarities];
    rarities[i] = { ...rarities[i], frame: url || undefined };
    setDraft({ ...draft, rarities });
    const { db } = getFirebase();
    if (db) await saveGameConfig(db, { rarities });
    setMsg("Rarity frame saved.");
  }

  const numCsv = (arr: number[]) => arr.join(", ");
  const parseCsv = (s: string) =>
    s
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => !Number.isNaN(n));

  return (
    <div>
      <TopHeader title="Game Settings" subtitle="Universal settings · Reef economy, fish & assets" />

      {msg && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-green/10 border border-green/30 rounded-lg text-[11px] text-green">
          <CheckCircle2 className="w-3.5 h-3.5" /> {msg}
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* General (cross-game) settings */}
      <Card className="mb-3">
        <CardHeader
          title="General settings"
          subtitle="Universal defaults that apply to every game — a game may override its own value"
        />
        {univDraft && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <NumField
                label="Universal daily credits"
                value={univDraft.universalDailyCredits}
                onChange={(v) => setUnivDraft({ ...univDraft, universalDailyCredits: v })}
              />
            </div>
            <p className="text-[10px] text-text-subtle m-0 flex-1 min-w-[180px] pb-2">
              Baseline cast credits refilled daily. Reef uses this unless it sets its own override below (a value &gt; 0).
            </p>
            <button
              onClick={saveUniversal}
              disabled={savingUniv}
              className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
            >
              {savingUniv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save general
            </button>
          </div>
        )}
      </Card>

      {/* Economy config */}
      <Card className="mb-3">
        <CardHeader title="Reef · Economy" subtitle="Energy, rarities, streak, prizes" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <NumField
            label="Daily credits (0 = universal)"
            value={draft.dailyEnergy}
            onChange={(v) => setDraft({ ...draft, dailyEnergy: v })}
          />
          <NumField
            label="Fish-of-hour chance"
            step={0.01}
            value={draft.fothChance}
            onChange={(v) => setDraft({ ...draft, fothChance: v })}
          />
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Fish of the hour
            </label>
            <button
              onClick={() => setDraft({ ...draft, fothEnabled: !draft.fothEnabled })}
              className={cn(
                "text-[11px] px-3 py-2 rounded-lg border w-full",
                draft.fothEnabled
                  ? "bg-green/15 border-green/30 text-green"
                  : "bg-card border-border text-text-muted"
              )}
            >
              {draft.fothEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>
          <NumField
            label="Treasure chance"
            step={0.01}
            value={draft.treasureChance}
            onChange={(v) => setDraft({ ...draft, treasureChance: v })}
          />
          <NumField
            label="Treasure min (pts)"
            value={draft.treasureMin}
            onChange={(v) => setDraft({ ...draft, treasureMin: v })}
          />
          <NumField
            label="Treasure max (pts)"
            value={draft.treasureMax}
            onChange={(v) => setDraft({ ...draft, treasureMax: v })}
          />
        </div>

        {/* Rarities */}
        <p className="text-[11px] font-medium m-0 mb-2">Rarities (weight = relative drop chance)</p>
        <div className="flex flex-col gap-1.5 mb-4">
          {draft.rarities.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-24 text-[11px]" style={{ color: r.color }}>
                {r.label}
              </span>
              <label className="text-[9px] text-text-subtle">weight</label>
              <input
                type="number"
                value={r.weight}
                onChange={(e) => {
                  const rarities = [...draft.rarities];
                  rarities[i] = { ...r, weight: Number(e.target.value) };
                  setDraft({ ...draft, rarities });
                }}
                className="w-16 px-2 py-1 bg-canvas border border-border rounded text-[11px] font-mono"
              />
              <label className="text-[9px] text-text-subtle">points</label>
              <input
                type="number"
                value={r.points}
                onChange={(e) => {
                  const rarities = [...draft.rarities];
                  rarities[i] = { ...r, points: Number(e.target.value) };
                  setDraft({ ...draft, rarities });
                }}
                className="w-20 px-2 py-1 bg-canvas border border-border rounded text-[11px] font-mono"
              />
              <FrameUpload
                value={r.frame}
                onSet={(url) => updateRarityFrame(i, url)}
                onError={setError}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <TextField
            label="Streak bonus by day (points, comma-sep)"
            value={numCsv(draft.streakBonus)}
            onChange={(s) => setDraft({ ...draft, streakBonus: parseCsv(s) })}
          />
          <TextField
            label="Weekly prizes top-N (points, comma-sep)"
            value={numCsv(draft.leaderboardPrizes)}
            onChange={(s) => setDraft({ ...draft, leaderboardPrizes: parseCsv(s) })}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={saveConfig}
            disabled={savingCfg}
            className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
          >
            {savingCfg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save config
          </button>
          <button
            onClick={() => setDraft(DEFAULT_GAME_CONFIG)}
            className="px-4 py-2 border border-border-strong rounded-lg text-[12px] text-text-muted"
          >
            Reset to defaults
          </button>
        </div>
      </Card>

      {/* Game assets */}
      <Card className="mb-3">
        <CardHeader
          title="Game assets"
          subtitle="Upload art, animation & audio to skin the reef · sizes in REEF_ASSETS.xlsx · empty slots fall back to the built-in look"
        />
        {ASSET_GROUPS.map((g) => (
          <div key={g.title} className="mb-4 last:mb-0">
            <p className="text-[11px] font-medium m-0 mb-2 text-text-muted">{g.title}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {g.fields.map((f) => (
                <AssetField
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  accept={f.accept}
                  value={draft.assets?.[f.key]}
                  onSet={(u) => updateAsset(f.key, u)}
                  onError={setError}
                />
              ))}
            </div>
          </div>
        ))}
      </Card>

      {/* Fish catalog */}
      <Card>
        <CardHeader
          title={`Fish catalog (${fish.length})`}
          right={
            <div className="flex gap-2">
              {fish.length === 0 ? (
                <button onClick={seed} className="text-[11px] px-2.5 py-1 bg-vault/15 text-vault rounded-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Seed creatures
                </button>
              ) : (
                <button onClick={reload} className="text-[11px] px-2.5 py-1 bg-vault/15 text-vault rounded-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Load generated set
                </button>
              )}
              <button
                onClick={() => {
                  setEditing({ id: "", name: "", rarity: draft.rarities[0]?.id ?? "common", emoji: "🐟", active: true });
                  setIsNew(true);
                }}
                className="text-[11px] px-2.5 py-1 bg-gold/15 text-gold rounded-md flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add fish
              </button>
            </div>
          }
        />
        {fish.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-6 m-0">
            No fish yet. Seed the starters or add your own.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {fish.map((f) => {
              const rarity = draft.rarities.find((r) => r.id === f.rarity);
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    setEditing(f);
                    setIsNew(false);
                  }}
                  className={cn(
                    "p-2 rounded-lg border text-center hover:border-gold/40 transition",
                    f.active === false ? "opacity-40 border-border" : "border-border"
                  )}
                >
                  {f.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.image} alt={f.name} className="w-8 h-8 object-cover rounded mx-auto mb-1" />
                  ) : (
                    <span className="text-2xl block mb-1">{f.emoji ?? "🐟"}</span>
                  )}
                  <p className="text-[10px] m-0 truncate">{f.name}</p>
                  <p className="text-[8px] m-0" style={{ color: rarity?.color }}>
                    {rarity?.label ?? f.rarity}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <FishEditor
        fish={editing}
        isNew={isNew}
        rarities={draft.rarities}
        onClose={() => setEditing(null)}
        onSaved={(m) => {
          setEditing(null);
          setMsg(m);
        }}
        onError={(e) => setError(e)}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] font-mono outline-none focus:border-gold/40"
      />
    </div>
  );
}

function AssetField({
  label,
  hint,
  accept,
  value,
  onSet,
  onError,
}: {
  label: string;
  hint?: string;
  accept: string;
  value?: string;
  onSet: (url: string) => void | Promise<void>;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const kind = assetKind(value);

  async function pick(file: File) {
    const { storage } = getFirebase();
    if (!storage) return;
    setBusy(true);
    try {
      const { url } = await uploadGameAsset(storage, file);
      await onSet(url);
    } catch (e) {
      onError(describeStorageError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-2 bg-canvas border border-border rounded-lg">
      <p className="text-[10px] text-text-muted m-0 mb-1.5 flex items-center justify-between">
        <span className="truncate">{label}</span>
        {hint && <span className="text-[8px] text-text-subtle shrink-0 ml-1">{hint}</span>}
      </p>
      <div className="h-16 rounded bg-card-elev/40 flex items-center justify-center overflow-hidden mb-1.5">
        {!value ? (
          <span className="text-[9px] text-text-subtle">empty</span>
        ) : kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={value} className="w-full h-full object-cover" muted loop autoPlay playsInline />
        ) : kind === "audio" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio src={value} controls className="w-full scale-90" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} className="w-full h-full object-contain" />
        )}
      </div>
      <div className="flex gap-1">
        <label className="flex-1 text-center text-[10px] px-2 py-1 bg-card-elev border border-border rounded cursor-pointer hover:border-gold/40">
          {busy ? "Uploading…" : value ? "Replace" : "Upload"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
          />
        </label>
        {value && (
          <button
            onClick={() => onSet("")}
            className="text-[10px] px-2 py-1 border border-border rounded text-text-subtle hover:text-red"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function FrameUpload({
  value,
  onSet,
  onError,
}: {
  value?: string;
  onSet: (url: string) => void | Promise<void>;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function pick(file: File) {
    const { storage } = getFirebase();
    if (!storage) return;
    setBusy(true);
    try {
      const { url } = await uploadGameAsset(storage, file);
      await onSet(url);
    } catch (e) {
      onError(describeStorageError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="text-[9px] px-2 py-1 bg-canvas border border-border rounded cursor-pointer hover:border-gold/40 whitespace-nowrap">
      {busy ? "…" : value ? "Frame ✓" : "+ Frame"}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] font-mono outline-none focus:border-gold/40"
      />
    </div>
  );
}

function FishEditor({
  fish,
  isNew,
  rarities,
  onClose,
  onSaved,
  onError,
}: {
  fish: Fish | null;
  isNew: boolean;
  rarities: { id: string; label: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState("common");
  const [emoji, setEmoji] = useState("🐟");
  const [image, setImage] = useState<string | undefined>(undefined);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (fish) {
      setName(fish.name);
      setRarity(fish.rarity);
      setEmoji(fish.emoji ?? "🐟");
      setImage(fish.image);
      setActive(fish.active !== false);
    }
  }, [fish]);

  async function handleImage(file: File) {
    const { storage } = getFirebase();
    if (!storage) return;
    setBusy(true);
    try {
      const { url } = await uploadGameImage(storage, "fish", file);
      setImage(url);
    } catch (e) {
      onError(describeStorageError(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const { db } = getFirebase();
    if (!db) return;
    if (!name.trim()) {
      onError("Name required");
      return;
    }
    setBusy(true);
    try {
      await saveFish(db, isNew ? null : fish!.id, {
        name: name.trim(),
        rarity,
        emoji: emoji || "🐟",
        active,
        ...(image ? { image } : {}),
      });
      onSaved(isNew ? "Fish added." : "Fish updated.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const { db } = getFirebase();
    if (!db || !fish || isNew) return;
    setBusy(true);
    try {
      await deleteFish(db, fish.id);
      onSaved("Fish deleted.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!fish} onClose={onClose} title={isNew ? "Add fish" : "Edit fish"}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="w-12 h-12 object-cover rounded-lg" />
          ) : (
            <span className="text-4xl">{emoji || "🐟"}</span>
          )}
          <label className="text-[11px] px-3 py-1.5 bg-card-elev border border-border rounded-lg cursor-pointer">
            {busy ? "Uploading…" : "Upload image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])}
            />
          </label>
        </div>
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] outline-none focus:border-gold/40"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Rarity</label>
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] outline-none focus:border-gold/40"
            >
              {rarities.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Emoji</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] outline-none focus:border-gold/40"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (catchable)
        </label>
        <div className="flex gap-2">
          {!isNew && (
            <button
              onClick={remove}
              disabled={busy}
              className="px-3 py-2.5 border border-red/30 text-red rounded-lg text-[12px] flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save fish"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
