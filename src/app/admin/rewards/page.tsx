"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { cn, formatPHP } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { uploadGameImage } from "@/lib/storage";
import {
  useRewards,
  useRedemptions,
  saveReward,
  deleteReward,
  seedRewardsIfEmpty,
  fulfillRedemption,
  rejectRedemption,
  REWARD_TYPE_LABELS,
  type Reward,
  type RewardType,
  type RedemptionStatus,
} from "@/lib/rewards";

const statusTabs: RedemptionStatus[] = ["pending", "fulfilled", "rejected"];

export default function AdminRewardsPage() {
  const { user } = useAuth();
  const { rewards } = useRewards();
  const { rows: redemptions } = useRedemptions("all");

  const [editing, setEditing] = useState<Reward | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<RedemptionStatus>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      pending: redemptions.filter((r) => r.status === "pending").length,
      fulfilled: redemptions.filter((r) => r.status === "fulfilled").length,
      rejected: redemptions.filter((r) => r.status === "rejected").length,
    }),
    [redemptions]
  );
  const filtered = redemptions.filter((r) => r.status === tab);

  async function seed() {
    const { db } = getFirebase();
    if (!db) return;
    try {
      const n = await seedRewardsIfEmpty(db);
      setMsg(n > 0 ? `Seeded ${n} rewards.` : "Rewards already exist.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    }
  }

  async function fulfill(id: string) {
    const { db } = getFirebase();
    if (!db || !user) return;
    setBusyId(id);
    setError(null);
    try {
      await fulfillRedemption(db, id, user.uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const { db } = getFirebase();
    if (!db || !user) return;
    const note = prompt("Reason for rejection (optional):") ?? undefined;
    setBusyId(id);
    setError(null);
    try {
      await rejectRedemption(db, id, user.uid, note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <TopHeader title="Rewards & redemptions" subtitle="Catalog + fulfillment queue" />

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

      {/* Catalog */}
      <Card className="mb-3">
        <CardHeader
          title={`Reward catalog (${rewards.length})`}
          right={
            <div className="flex gap-2">
              {rewards.length === 0 && (
                <button onClick={seed} className="text-[11px] px-2.5 py-1 bg-vault/15 text-vault rounded-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Seed
                </button>
              )}
              <button
                onClick={() => {
                  setEditing({ id: "", name: "", type: "wallet", cost: 1000, walletAmount: 0, active: true });
                  setIsNew(true);
                }}
                className="text-[11px] px-2.5 py-1 bg-gold/15 text-gold rounded-md flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add reward
              </button>
            </div>
          }
        />
        {rewards.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-6 m-0">No rewards yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rewards.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setEditing(r);
                  setIsNew(false);
                }}
                className={cn(
                  "p-3 rounded-lg border text-left hover:border-gold/40 transition",
                  r.active ? "border-border" : "border-border opacity-50"
                )}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-card-elev text-text-muted">
                    {REWARD_TYPE_LABELS[r.type]}
                  </span>
                  <span className="text-[11px] font-mono text-vault">{r.cost.toLocaleString()} pts</span>
                </div>
                <p className="text-[12px] m-0 mt-1.5">{r.name}</p>
                <p className="text-[9px] text-text-subtle m-0 mt-0.5">
                  {r.type === "wallet" ? formatPHP(r.walletAmount ?? 0) : typeof r.stock === "number" ? `${r.stock} in stock` : "Unlimited"}
                </p>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Redemption queue */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {statusTabs.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "bg-card border rounded-xl p-3 text-left transition capitalize",
              tab === k ? "border-border-vault" : "border-border hover:border-border-strong"
            )}
          >
            <p className="text-[18px] font-mono font-medium m-0">{counts[k]}</p>
            <p className="text-[11px] m-0 text-text-muted">{k}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`${tab} redemptions`} />
        {filtered.length === 0 ? (
          <p className="text-[11px] text-text-subtle text-center py-6 m-0">Nothing here.</p>
        ) : (
          filtered.map((r, i) => (
            <div
              key={r.id}
              className={cn("flex flex-wrap items-center gap-3 py-2.5", i < filtered.length - 1 && "border-b border-border")}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">{r.rewardName}</p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5 truncate">
                  {r.userName} · {r.userEmail} · {REWARD_TYPE_LABELS[r.type]}
                  {r.note && <span className="text-vault-muted"> · {r.note}</span>}
                </p>
              </div>
              <span className="text-[11px] font-mono text-vault shrink-0">{r.cost.toLocaleString()} pts</span>
              {tab === "pending" ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => fulfill(r.id)}
                    disabled={busyId === r.id}
                    className="text-[11px] px-3 py-1.5 bg-green/15 text-green rounded-md flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Fulfill
                  </button>
                  <button
                    onClick={() => reject(r.id)}
                    disabled={busyId === r.id}
                    className="text-[11px] px-3 py-1.5 bg-card-elev border border-border-strong text-text-muted rounded-md hover:text-red flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-text-subtle flex items-center gap-1">
                  {r.status === "fulfilled" ? <CheckCircle2 className="w-3 h-3 text-green" /> : <Clock className="w-3 h-3" />}
                  {new Date(r.processedAt ?? r.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          ))
        )}
      </Card>

      <RewardEditor
        reward={editing}
        isNew={isNew}
        onClose={() => setEditing(null)}
        onSaved={(m) => {
          setEditing(null);
          setMsg(m);
        }}
        onError={setError}
      />
    </div>
  );
}

function RewardEditor({
  reward,
  isNew,
  onClose,
  onSaved,
  onError,
}: {
  reward: Reward | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<RewardType>("wallet");
  const [cost, setCost] = useState(1000);
  const [walletAmount, setWalletAmount] = useState(0);
  const [stock, setStock] = useState<string>("");
  const [active, setActive] = useState(true);
  const [image, setImage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (reward) {
      setName(reward.name);
      setDescription(reward.description ?? "");
      setType(reward.type);
      setCost(reward.cost);
      setWalletAmount(reward.walletAmount ?? 0);
      setStock(typeof reward.stock === "number" ? String(reward.stock) : "");
      setActive(reward.active);
      setImage(reward.image);
    }
  }, [reward]);

  async function handleImage(file: File) {
    const { storage } = getFirebase();
    if (!storage) return;
    setBusy(true);
    try {
      const { url } = await uploadGameImage(storage, "rewards", file);
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
      await saveReward(db, isNew ? null : reward!.id, {
        name: name.trim(),
        description: description.trim(),
        type,
        cost,
        active,
        ...(type === "wallet" ? { walletAmount } : {}),
        ...(stock.trim() !== "" ? { stock: Number(stock) } : { stock: null }),
        ...(image ? { image } : {}),
      });
      onSaved(isNew ? "Reward added." : "Reward updated.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const { db } = getFirebase();
    if (!db || !reward || isNew) return;
    setBusy(true);
    try {
      await deleteReward(db, reward.id);
      onSaved("Reward deleted.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!reward} onClose={onClose} title={isNew ? "Add reward" : "Edit reward"}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="w-12 h-12 object-cover rounded-lg" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-canvas flex items-center justify-center text-text-subtle text-[10px]">
              No img
            </div>
          )}
          <label className="text-[11px] px-3 py-1.5 bg-card-elev border border-border rounded-lg cursor-pointer">
            {busy ? "Uploading…" : "Upload image"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} />
          </label>
        </div>
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] outline-none focus:border-gold/40" />
        </div>
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] outline-none focus:border-gold/40" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as RewardType)} className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] outline-none focus:border-gold/40">
              <option value="wallet">Wallet credit</option>
              <option value="gadget">Gadget</option>
              <option value="activity">Activity</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Cost (points)</label>
            <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] font-mono outline-none focus:border-gold/40" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {type === "wallet" && (
            <div>
              <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Wallet ₱ credited</label>
              <input type="number" value={walletAmount} onChange={(e) => setWalletAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] font-mono outline-none focus:border-gold/40" />
            </div>
          )}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Stock (blank = ∞)</label>
            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="unlimited" className="w-full px-3 py-2 bg-canvas border border-border rounded-lg text-[13px] font-mono outline-none focus:border-gold/40" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (shown in store)
        </label>
        <div className="flex gap-2">
          {!isNew && (
            <button onClick={remove} disabled={busy} className="px-3 py-2.5 border border-red/30 text-red rounded-lg text-[12px] flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium disabled:opacity-60">
            {busy ? "Saving…" : "Save reward"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
