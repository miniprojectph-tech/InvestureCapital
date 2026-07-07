"use client";

import { useRef, useState } from "react";
import { Spade, Loader2, Ban, Flag, Trash2, Users, Upload, RotateCcw, Image as ImageIcon } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { cancelRoom, seatedPlayers } from "@/lib/tongits";
import {
  useAdminActiveRooms,
  useAdminRecentMatches,
  useAdminChatReports,
  useAdminPointTxns,
  adminDeleteChatMessage,
  adminDismissReport,
} from "@/lib/tongits-social";
import {
  useTongitsAssets,
  saveTongitsAsset,
  resetTongitsAsset,
  TONGITS_ASSET_SLOTS,
  type TongitsAssetKey,
} from "@/lib/tongitsAssets";
import { uploadGameAsset, describeStorageError } from "@/lib/storage";

type Tab = "rooms" | "matches" | "reports" | "ledger" | "assets";

export default function AdminTongitsPage() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const [tab, setTab] = useState<Tab>("rooms");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rooms = useAdminActiveRooms(isAdmin);
  const matches = useAdminRecentMatches(isAdmin);
  const reports = useAdminChatReports(isAdmin);
  const ledger = useAdminPointTxns(isAdmin);

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*\/ /, "") : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "rooms", label: "Active rooms", count: rooms.rows.length },
    { id: "matches", label: "Matches", count: matches.rows.length },
    { id: "reports", label: "Chat reports", count: reports.rows.length },
    { id: "ledger", label: "Point ledger", count: ledger.rows.length },
    { id: "assets", label: "Assets", count: TONGITS_ASSET_SLOTS.length },
  ];

  return (
    <div>
      <TopHeader title="Community Tongits" subtitle="Rooms, matches, moderation, and the point ledger" />

      {error && (
        <div className="mb-3 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">{error}</div>
      )}

      <div className="flex items-center gap-1 mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition shrink-0",
              tab === t.id ? "bg-gold text-gold-dark font-medium" : "bg-card-elev text-text-muted hover:text-text"
            )}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      {tab === "rooms" && (
        <Card className="p-0">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[12px] font-medium m-0">Active rooms</p>
          </div>
          {rooms.loading ? (
            <Spin />
          ) : rooms.rows.length === 0 ? (
            <Empty text="No active rooms." />
          ) : (
            <div className="divide-y divide-border/60">
              {rooms.rows.map((r) => (
                <div key={r.roomCode} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
                    <Spade className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] m-0 font-mono">
                      {r.roomCode} <span className="text-text-subtle font-sans">· {r.status}</span>
                    </p>
                    <p className="text-[10px] text-text-subtle m-0 inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> {seatedPlayers(r).length}/3
                      </span>
                      <span>· {r.challengePoints} pts</span>
                      {(r.jackpotPoints ?? 0) > 0 && <span>· jackpot {r.jackpotPoints}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => run(`cancel-${r.roomCode}`, () => cancelRoom(r.roomCode))}
                    disabled={busy === `cancel-${r.roomCode}`}
                    className="px-2.5 py-1.5 text-[11px] text-red border border-border-strong rounded-md hover:bg-red/10 transition inline-flex items-center gap-1.5 disabled:opacity-60 shrink-0"
                  >
                    {busy === `cancel-${r.roomCode}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Ban className="w-3.5 h-3.5" />
                    )}
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "matches" && (
        <Card className="p-0">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[12px] font-medium m-0">Recent matches</p>
          </div>
          {matches.loading ? (
            <Spin />
          ) : matches.rows.length === 0 ? (
            <Empty text="No matches yet." />
          ) : (
            <div className="divide-y divide-border/60">
              {matches.rows.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] m-0 font-mono">
                      {m.roomCode} <span className="text-text-subtle font-sans">· {m.resultType}</span>
                    </p>
                    <p className="text-[10px] text-text-subtle m-0">
                      {m.matchDurationSeconds}s · {new Date(m.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-[10px] text-text-subtle font-mono shrink-0">
                    winner {m.winnerUserId.slice(0, 6)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "reports" && (
        <Card className="p-0">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[12px] font-medium m-0">Reported chat messages</p>
          </div>
          {reports.loading ? (
            <Spin />
          ) : reports.rows.length === 0 ? (
            <Empty text="No open reports." />
          ) : (
            <div className="divide-y divide-border/60">
              {reports.rows.map((rep) => (
                <div key={rep.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Flag className="w-4 h-4 text-red shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] m-0">
                      Room <span className="font-mono">{rep.roomCode}</span> · msg{" "}
                      <span className="font-mono text-text-subtle">{rep.messageId.slice(0, 8)}</span>
                    </p>
                    <p className="text-[10px] text-text-subtle m-0">
                      by {rep.reporterUserId.slice(0, 6)} · {new Date(rep.createdAt).toLocaleString()}
                      {rep.reason ? ` · ${rep.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() =>
                        run(`del-${rep.id}`, async () => {
                          const { db } = getFirebase();
                          if (!db) return;
                          await adminDeleteChatMessage(db, rep.roomCode, rep.messageId);
                          await adminDismissReport(db, rep.id);
                        })
                      }
                      disabled={busy === `del-${rep.id}`}
                      className="px-2.5 py-1.5 text-[11px] text-red border border-border-strong rounded-md hover:bg-red/10 transition inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete msg
                    </button>
                    <button
                      onClick={() =>
                        run(`dismiss-${rep.id}`, async () => {
                          const { db } = getFirebase();
                          if (!db) return;
                          await adminDismissReport(db, rep.id);
                        })
                      }
                      disabled={busy === `dismiss-${rep.id}`}
                      className="px-2.5 py-1.5 text-[11px] text-text-muted border border-border-strong rounded-md hover:text-text transition disabled:opacity-60"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "ledger" && (
        <Card className="p-0">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[12px] font-medium m-0">Point transaction audit</p>
          </div>
          {ledger.loading ? (
            <Spin />
          ) : ledger.rows.length === 0 ? (
            <Empty text="No transactions yet." />
          ) : (
            <div className="divide-y divide-border/60">
              {ledger.rows.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] m-0">
                      <span className="font-mono">{t.userId.slice(0, 6)}</span> · {t.type}
                    </p>
                    <p className="text-[9px] text-text-subtle m-0">
                      {t.roomCode ? `room ${t.roomCode} · ` : ""}
                      {new Date(t.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-[12px] font-mono shrink-0 text-text">{t.amount}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "assets" && <AssetsPanel onError={setError} />}
    </div>
  );
}

function AssetsPanel({ onError }: { onError: (s: string | null) => void }) {
  const assets = useTongitsAssets();
  return (
    <Card className="p-0">
      <div className="px-4 py-2.5 border-b border-border">
        <p className="text-[12px] font-medium m-0">Game art</p>
        <p className="text-[10px] text-text-subtle mt-0.5 m-0">
          Upload your own art per slot — it replaces the bundled default live. Use transparent PNGs for the
          seat/logo pieces.
        </p>
      </div>
      <div className="divide-y divide-border/60">
        {TONGITS_ASSET_SLOTS.map((s) => (
          <AssetSlot key={s.key} slot={s} current={assets[s.key]} onError={onError} />
        ))}
      </div>
    </Card>
  );
}

function AssetSlot({
  slot,
  current,
  onError,
}: {
  slot: { key: TongitsAssetKey; label: string; def: string; hint?: string };
  current: string;
  onError: (s: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "reset" | null>(null);
  const isCustom = current !== slot.def;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { db, storage } = getFirebase();
    if (!db || !storage) return onError("Not connected.");
    onError(null);
    setBusy("upload");
    try {
      const { url } = await uploadGameAsset(storage, file);
      await saveTongitsAsset(db, slot.key, url);
    } catch (err) {
      onError(describeStorageError(err));
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    const { db } = getFirebase();
    if (!db) return;
    setBusy("reset");
    try {
      await resetTongitsAsset(db, slot.key);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-20 h-14 rounded-md bg-canvas border border-border flex items-center justify-center overflow-hidden shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current ? (
          <img src={current} alt="" className="max-w-full max-h-full object-contain" />
        ) : (
          <ImageIcon className="w-5 h-5 text-text-subtle" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium m-0">
          {slot.label}
          {isCustom && <span className="text-[9px] text-green ml-2 uppercase tracking-wide">custom</span>}
        </p>
        {slot.hint && <p className="text-[10px] text-text-subtle m-0">{slot.hint}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy !== null}
        className="px-3 py-1.5 text-[11px] bg-gold text-gold-dark rounded-md font-medium inline-flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-60 shrink-0"
      >
        {busy === "upload" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Upload
      </button>
      {isCustom && (
        <button
          onClick={reset}
          disabled={busy !== null}
          className="px-2.5 py-1.5 text-[11px] text-text-muted border border-border-strong rounded-md hover:text-text transition disabled:opacity-60 shrink-0"
          title="Revert to default"
        >
          {busy === "reset" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

function Spin() {
  return (
    <div className="py-12 flex justify-center">
      <Loader2 className="w-5 h-5 text-gold animate-spin" />
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-[12px] text-text-muted text-center py-12 m-0">{text}</p>;
}
