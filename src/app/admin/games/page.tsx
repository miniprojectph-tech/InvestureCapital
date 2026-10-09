"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Save, Sparkles, AlertCircle, CheckCircle2, AlertTriangle, Sliders, Coins, Image as ImageIcon, Fish as FishIcon, Users, type LucideIcon } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { AdminTabs, useHashTab } from "@/components/admin/AdminTabs";
import { Card, CardHeader } from "@/components/Card";
import { doc, onSnapshot } from "firebase/firestore";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { uploadGameImage, uploadGameAsset, describeStorageError } from "@/lib/storage";
import {
  useGameConfig,
  useGamesSettings,
  saveGamesSettings,
  dailyBonusPoints,
  DEFAULT_DAILY_BONUS,
  type DailyBonusConfig,
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
import {
  useSettings,
  saveSettings,
  DEFAULT_GAME_ACCESS,
  type GameAccessRequirement,
} from "@/lib/settings";
import { PlayerPointsPanel } from "@/components/admin/PlayerPointsPanel";

type SettingsTab = "access" | "reef" | "assets" | "fish" | "players";
const SETTINGS_TABS: { key: SettingsTab; label: string; icon: LucideIcon }[] = [
  { key: "access", label: "Access & general", icon: Sliders },
  { key: "reef", label: "Reef economy", icon: Coins },
  { key: "assets", label: "Assets", icon: ImageIcon },
  { key: "fish", label: "Fish", icon: FishIcon },
  { key: "players", label: "Players & points", icon: Users },
];
const SETTINGS_TAB_IDS = SETTINGS_TABS.map((t) => t.key);

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

  // Game access gate
  const { settings: platformSettings } = useSettings();
  const [gaDraft, setGaDraft] = useState<GameAccessRequirement | null>(null);
  const [savingGa, setSavingGa] = useState(false);

  // Fish editor
  const [editing, setEditing] = useState<Fish | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useHashTab<SettingsTab>(SETTINGS_TAB_IDS, "access");

  useEffect(() => {
    if (!loading && !draft) setDraft(config);
  }, [loading, config, draft]);
  useEffect(() => {
    if (univDraft === null) setUnivDraft(gamesSettings);
  }, [gamesSettings, univDraft]);
  useEffect(() => {
    if (gaDraft === null && platformSettings.gameAccess)
      setGaDraft({ ...DEFAULT_GAME_ACCESS, ...platformSettings.gameAccess });
  }, [platformSettings, gaDraft]);

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

  async function saveGameAccess() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin || !gaDraft) return;
    setSavingGa(true);
    setError(null);
    setMsg(null);
    try {
      await saveSettings(db, { gameAccess: gaDraft }, user.uid);
      setMsg("Game access settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingGa(false);
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

      <AdminTabs tabs={SETTINGS_TABS.map((t) => ({ id: t.key, label: t.label, icon: t.icon }))} value={tab} onChange={setTab} />

      {tab === "access" && (
        <>
      {/* Community Games access gate */}
      <Card className="mb-3">
        <CardHeader
          title="Community Games access"
          subtitle="Require an active plan to unlock Fishing Game, Rewards, and Tongits"
        />
        {gaDraft && (
          <>
            <div className="flex items-center justify-between gap-3 p-3 bg-canvas border border-border rounded-lg mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center ${
                    gaDraft.enabled ? "bg-gold/15 text-gold" : "bg-card-elev text-text-muted"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[12px] font-medium m-0">
                    {gaDraft.enabled ? "Gate active — placement required" : "Gate off — everyone can play"}
                  </p>
                  <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                    {gaDraft.enabled
                      ? `Requires active placements of at least ₱${(gaDraft.minInvestment ?? 0).toLocaleString()}`
                      : "Toggle on and set a minimum placement to restrict access"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGaDraft({ ...gaDraft, enabled: !gaDraft.enabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  gaDraft.enabled ? "bg-gold" : "bg-border"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform",
                    gaDraft.enabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {gaDraft.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">Rule</label>
                  <p className="text-[11px] text-text-subtle m-0 leading-relaxed bg-canvas border border-border rounded-md px-3 py-2">
                    A member can play when their total <span className="text-text">active placements</span> reach the minimum below.
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">Minimum active placement (₱)</label>
                  <input
                    type="number"
                    value={gaDraft.minInvestment}
                    onChange={(e) =>
                      setGaDraft({ ...gaDraft, minInvestment: parseInt(e.target.value) || 0 })
                    }
                    className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40 w-full"
                  />
                </div>
              </div>
            )}

            <button
              onClick={saveGameAccess}
              disabled={savingGa}
              className="w-full py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {savingGa ? "Saving…" : "Save access settings"}
            </button>
          </>
        )}
      </Card>

      {/* Daily placement bonus */}
      <DailyBonusCard />

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
        </>
      )}

      {tab === "reef" && (
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
          <NumField
            label="Daily budget min (pts)"
            value={draft.dailyBudgetMin ?? 0}
            onChange={(v) => setDraft({ ...draft, dailyBudgetMin: v })}
          />
          <NumField
            label="Daily budget max (pts)"
            value={draft.dailyBudgetMax ?? 0}
            onChange={(v) => setDraft({ ...draft, dailyBudgetMax: v })}
          />
        </div>

        {/* Rarities */}
        <p className="text-[11px] font-medium m-0 mb-2">
          Rarities (weight = drop chance · completion = one-time points for catching every fish of the tier)
        </p>
        <div className="flex flex-col gap-1.5 mb-4">
          {draft.rarities.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 flex-wrap">
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
              <label className="text-[9px] text-text-subtle">completion</label>
              <input
                type="number"
                value={r.completionBonus ?? 0}
                onChange={(e) => {
                  const rarities = [...draft.rarities];
                  rarities[i] = { ...r, completionBonus: Number(e.target.value) };
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
      )}

      {tab === "assets" && (
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
      )}

      {tab === "fish" && (
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
      )}

      {tab === "players" && <PlayerPointsPanel />}

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

/** Daily Game Points for active placements: on/off, points per ₱1,000, a cap, the pop-up text, and today's tally. */
function DailyBonusCard() {
  const { user } = useAuth();
  const { settings } = useGamesSettings();
  const saved: DailyBonusConfig = { ...DEFAULT_DAILY_BONUS, ...(settings.dailyBonus ?? {}) };
  const [draft, setDraft] = useState<DailyBonusConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [stats, setStats] = useState<{ claims: number; points: number } | null>(null);
  const cur = draft ?? saved;
  const dirty = JSON.stringify(cur) !== JSON.stringify(saved);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db) return;
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    return onSnapshot(doc(db, "games", "dailyBonusStats"), (s) => {
      const d = (s.data() as { days?: Record<string, { claims?: number; points?: number }> } | undefined)?.days?.[today];
      setStats({ claims: d?.claims ?? 0, points: d?.points ?? 0 });
    }, () => setStats(null));
  }, []);

  async function save() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    const rate = Math.floor(Number(cur.pointsPerThousand));
    const cap = Math.floor(Number(cur.cap));
    if (cur.enabled && (!Number.isFinite(rate) || rate < 1)) return setMsg({ ok: false, text: "Enter the points per ₱1,000 (at least 1)." });
    if (!Number.isFinite(cap) || cap < 0) return setMsg({ ok: false, text: "The daily cap is 0 (none) or a positive number." });
    setSaving(true);
    setMsg(null);
    try {
      await saveGamesSettings(db, { dailyBonus: { enabled: cur.enabled, pointsPerThousand: Math.max(0, rate || 0), cap, text: cur.text.trim().slice(0, 300) || DEFAULT_DAILY_BONUS.text } });
      setDraft(null);
      setMsg({ ok: true, text: cur.enabled ? "Saved. Members see the bonus the next time they open Games." : "Saved. The daily bonus is off." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const input = "bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40 w-full";
  return (
    <Card className="mb-3">
      <CardHeader
        title="Daily game bonus"
        subtitle="Game Points a member can claim once a day in Games Central, based on their active placements. Unclaimed days don't carry over."
        right={
          <button
            type="button"
            onClick={() => { setDraft({ ...cur, enabled: !cur.enabled }); setMsg(null); }}
            className={cn("px-3 py-1 rounded-full text-[10px] font-medium border transition", cur.enabled ? "bg-green/15 border-green/40 text-green" : "bg-canvas border-border text-text-muted")}
          >
            {cur.enabled ? "On" : "Off"}
          </button>
        }
      />
      <div className={cn("grid grid-cols-1 md:grid-cols-[1fr_1fr_1.6fr] gap-3", !cur.enabled && "opacity-60")}>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">Points per ₱1,000 active</label>
          <input type="number" min={0} value={cur.pointsPerThousand} disabled={!cur.enabled} onChange={(e) => { setDraft({ ...cur, pointsPerThousand: Number(e.target.value) }); setMsg(null); }} className={input} />
        </div>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">Daily cap (0 = none)</label>
          <input type="number" min={0} value={cur.cap} disabled={!cur.enabled} onChange={(e) => { setDraft({ ...cur, cap: Number(e.target.value) }); setMsg(null); }} className={input} />
        </div>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">Pop-up text</label>
          <input value={cur.text} maxLength={300} disabled={!cur.enabled} onChange={(e) => { setDraft({ ...cur, text: e.target.value }); setMsg(null); }} className={cn(input, "font-sans")} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={save} disabled={saving || !dirty} className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
        {dirty && !saving && <button onClick={() => { setDraft(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard</button>}
        {msg && <span className={cn("text-[11px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</span>}
        <span className="ml-auto text-[11px] text-text-subtle">
          Today: <span className="text-text font-mono">{stats ? stats.claims.toLocaleString() : "—"}</span> claims · <span className="text-text font-mono">{stats ? stats.points.toLocaleString() : "—"}</span> points given
        </span>
      </div>
      <p className="text-[10px] text-text-subtle m-0 mt-2 leading-relaxed max-w-2xl">
        Example at {cur.pointsPerThousand || 0} per ₱1,000: ₱2,500 active earns {dailyBonusPoints(2500, cur).toLocaleString()} points a day; ₱10,000 earns {dailyBonusPoints(10000, cur).toLocaleString()}.
        Members with nothing active see only a line inviting them to place capital. The bonus goes to the Game Points balance, not the weekly rankings.
      </p>
    </Card>
  );
}
