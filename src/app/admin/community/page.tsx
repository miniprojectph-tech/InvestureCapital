"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VolumeX, Pin, ExternalLink, ShieldCheck, Search, Plus, X, Loader2, RefreshCw } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { InboxPanel } from "@/components/community/InboxPanel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { listInvestors, type InvestorRow } from "@/lib/adminQueries";
import {
  useMutedUsers,
  useCommunityRoom,
  usePinnedMessage,
  useChatMods,
  useCommunityStats,
  refreshCommunityStats,
  unmuteUser,
  setPinnedMessage,
  ensureCommunityAdmin,
  addChatMod,
  setChatModInbox,
  removeChatMod,
  formatRelative,
} from "@/lib/community";

export default function AdminCommunityPage() {
  const { user, demoMode } = useAuth();
  const [adminReady, setAdminReady] = useState(false);

  const mutedUsers = useMutedUsers(adminReady);
  const { messages: room } = useCommunityRoom(true);
  const stats = useCommunityStats(adminReady);
  const [refreshing, setRefreshing] = useState(false);
  const pinned = usePinnedMessage(room);

  useEffect(() => {
    if (user?.isAdmin) ensureCommunityAdmin().then(setAdminReady);
  }, [user?.isAdmin]);

  if (!user) return null;
  const staff = { uid: user.uid, name: "Admin", isAdmin: true };

  return (
    <div>
      <TopHeader title="Community chat" subtitle="Member inbox, moderators, and room moderation" />

      {!adminReady && user.isAdmin && (
        <p className="text-[10px] text-text-subtle m-0 mb-2 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Syncing moderator access…
        </p>
      )}

      <div className="mb-3">
        <InboxPanel
          staff={staff}
          canSend={adminReady}
          threadAside={
            <Link href="/admin/investors" className="text-[10px] text-text-subtle hover:text-text flex items-center gap-1">
              Investors <ExternalLink className="w-3 h-3" />
            </Link>
          }
        />
      </div>

      {/* Chat storage — history is kept forever, so keep an eye on growth */}
      <Card className="mb-3">
        <CardHeader
          title="Chat storage"
          subtitle="History is never deleted. Totals update daily — refresh for a live count."
          right={
            <button
              onClick={() => { setRefreshing(true); refreshCommunityStats().catch(() => {}).finally(() => setRefreshing(false)); }}
              disabled={refreshing || !adminReady}
              className="text-[10px] text-gold hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} /> Refresh
            </button>
          }
        />
        {(() => {
          const msgs = stats?.roomMessages ?? 0;
          const dbGb = (msgs * 300) / 1e9;
          const mediaGb = (stats?.mediaBytes ?? 0) / 1e9;
          const monthly = Math.max(0, dbGb - 1) * 5 + mediaGb * 0.026;
          const fmtSize = (gb: number) => (gb >= 1 ? `${gb.toFixed(2)} GB` : `${(gb * 1000).toFixed(gb * 1000 >= 10 ? 0 : 1)} MB`);
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <StorageTile label="Room messages" value={msgs.toLocaleString()} sub={`≈ ${fmtSize(dbGb)} in the database`} />
              <StorageTile label="Media files" value={stats?.mediaFiles != null ? stats.mediaFiles.toLocaleString() : "—"} sub={stats?.mediaBytes != null ? fmtSize(mediaGb) : "not measured yet"} />
              <StorageTile label="Est. storage cost" value={`$${monthly.toFixed(2)} / mo`} sub="first 1 GB of messages is free" tone="text-green" />
              <StorageTile label="Last updated" value={stats?.updatedAt ? formatRelative(stats.updatedAt) + " ago" : "never"} sub="runs automatically every day" />
            </div>
          );
        })()}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ModeratorsCard enabled={adminReady} demoMode={demoMode} />

        <Card>
          <CardHeader
            title="Community Room"
            subtitle="Post banners, pin and delete messages, or mute members directly in the room"
            right={
              <Link href="/community" className="text-[11px] text-gold hover:underline flex items-center gap-1">
                Open room <ExternalLink className="w-3 h-3" />
              </Link>
            }
          />
          <div className="flex items-start gap-2 bg-canvas border border-border rounded-lg px-3 py-2.5">
            <Pin className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-text-subtle m-0 mb-0.5">Pinned message</p>
              {pinned ? (
                <p className="text-[11px] text-text m-0 truncate">
                  <span className="text-gold">{pinned.name}: </span>
                  {pinned.text ?? (pinned.kind === "image" ? "📷 Photo" : "🎬 Video")}
                </p>
              ) : (
                <p className="text-[11px] text-text-subtle m-0">Nothing pinned — use the ⋯ menu on a room message.</p>
              )}
            </div>
            {pinned && (
              <button onClick={() => setPinnedMessage(null)} className="text-[10px] text-text-muted hover:text-red shrink-0">
                Unpin
              </button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Muted members" subtitle={`${mutedUsers.length} muted — they can read the room but not post`} />
          {mutedUsers.length === 0 ? (
            <p className="text-[11px] text-text-subtle m-0">No one is muted.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {mutedUsers.map((m) => (
                <div key={m.uid} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
                  <VolumeX className="w-3.5 h-3.5 text-red shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-text m-0 truncate">{m.name}</p>
                    <p className="text-[9px] text-text-subtle m-0">muted {formatRelative(m.at)} ago</p>
                  </div>
                  <button onClick={() => unmuteUser(m.uid)} className="text-[10px] px-2 py-1 rounded-md bg-card-elev text-text hover:bg-gold/15 hover:text-gold transition">
                    Unmute
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StorageTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-canvas border border-border rounded-lg px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-text-subtle m-0 mb-1">{label}</p>
      <p className={cn("text-[14px] font-mono font-medium m-0 tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-[9px] text-text-subtle m-0 mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * Chat moderators: members granted moderation powers in the Community Room
 * (delete / pin / mute / links / video) without full admin access. The
 * "Inbox" toggle additionally lets them read and reply to member → admin
 * private threads.
 */
function ModeratorsCard({ enabled, demoMode }: { enabled: boolean; demoMode: boolean }) {
  const mods = useChatMods(enabled);
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    if (!db || demoMode) return;
    listInvestors(db, 500).then(setInvestors).catch(() => {});
  }, [demoMode]);

  const modIds = useMemo(() => new Set(mods.map((m) => m.uid)), [mods]);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return investors
      .filter((i) => !modIds.has(i.uid) && (i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [search, investors, modIds]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Chat moderators"
        subtitle="Members who can moderate the room without full admin access"
        right={<ShieldCheck className="w-4 h-4 text-gold" />}
      />

      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a member to add…"
          disabled={!enabled}
          className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[11px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle disabled:opacity-50"
        />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border-strong rounded-lg shadow-xl shadow-black/50 overflow-hidden">
            {results.map((r) => (
              <button
                key={r.uid}
                onClick={() => run(r.uid, async () => { await addChatMod(r.uid, r.name, false); setSearch(""); })}
                disabled={busy === r.uid}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card-elev transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text m-0 truncate">{r.name}</p>
                  <p className="text-[9px] text-text-subtle m-0 truncate">{r.email}</p>
                </div>
                {busy === r.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" /> : <Plus className="w-3.5 h-3.5 text-gold" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-[10px] text-red m-0 mb-2">{error}</p>}

      {mods.length === 0 ? (
        <p className="text-[11px] text-text-subtle m-0">No moderators yet. Search a member above to add one.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {mods.map((m) => (
            <div key={m.uid} className="flex items-center gap-2 bg-canvas border border-border rounded-lg px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-gold shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text m-0 truncate">{m.name}</p>
                <p className="text-[9px] text-text-subtle m-0">added {formatRelative(m.at)} ago</p>
              </div>
              <button
                onClick={() => run(`inbox-${m.uid}`, () => setChatModInbox(m.uid, !m.inbox))}
                disabled={busy === `inbox-${m.uid}`}
                title="Allow this moderator to read and reply to member → admin private messages"
                className={cn(
                  "text-[9px] px-2 py-1 rounded-md border transition",
                  m.inbox ? "bg-gold/15 text-gold border-gold/30" : "bg-card-elev text-text-muted border-transparent hover:text-text",
                )}
              >
                Inbox {m.inbox ? "on" : "off"}
              </button>
              <button
                onClick={() => run(`rm-${m.uid}`, () => removeChatMod(m.uid))}
                disabled={busy === `rm-${m.uid}`}
                className="p-1 text-text-subtle hover:text-red transition"
                aria-label={`Remove ${m.name} as moderator`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-text-subtle m-0 mt-3 leading-relaxed">
        Moderators get the ⋯ menu (pin · mute · delete), can post links and videos, and are tagged <span className="text-gold">Mod</span>.
        They moderate from the Community page — they can&apos;t open this admin panel.
      </p>
    </Card>
  );
}
