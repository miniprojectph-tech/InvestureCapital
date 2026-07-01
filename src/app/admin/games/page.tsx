"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Save, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { uploadGameImage } from "@/lib/storage";
import {
  useGameConfig,
  useFish,
  saveGameConfig,
  saveFish,
  deleteFish,
  seedFishIfEmpty,
  DEFAULT_GAME_CONFIG,
  type GameConfig,
  type Fish,
} from "@/lib/game";

export default function AdminGamesPage() {
  const { user } = useAuth();
  const { config, loading } = useGameConfig();
  const { fish } = useFish();

  const [draft, setDraft] = useState<GameConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fish editor
  const [editing, setEditing] = useState<Fish | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!loading && !draft) setDraft(config);
  }, [loading, config, draft]);

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

  async function seed() {
    const { db } = getFirebase();
    if (!db) return;
    try {
      const n = await seedFishIfEmpty(db);
      setMsg(n > 0 ? `Seeded ${n} starter fish.` : "Fish already exist — nothing seeded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    }
  }

  const numCsv = (arr: number[]) => arr.join(", ");
  const parseCsv = (s: string) =>
    s
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => !Number.isNaN(n));

  return (
    <div>
      <TopHeader title="Reef game" subtitle="Fish catalog, drop rates & economy" />

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

      {/* Economy config */}
      <Card className="mb-3">
        <CardHeader title="Economy" subtitle="Energy, rarities, streak, prizes" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <NumField
            label="Daily energy (casts)"
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

      {/* Fish catalog */}
      <Card>
        <CardHeader
          title={`Fish catalog (${fish.length})`}
          right={
            <div className="flex gap-2">
              {fish.length === 0 && (
                <button onClick={seed} className="text-[11px] px-2.5 py-1 bg-vault/15 text-vault rounded-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Seed starters
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
      onError(e instanceof Error ? e.message : "Upload failed");
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
