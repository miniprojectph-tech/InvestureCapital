"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, X, Clock, AlertCircle, Loader2, CalendarClock, CalendarCog, Pencil, Search } from "lucide-react";
import { PayoutDetails } from "@/components/admin/PayoutDetails";
import { TopHeader } from "@/components/TopHeader";
import { AdminTabs, useHashTab } from "@/components/admin/AdminTabs";
import { Card, CardHeader } from "@/components/Card";
import { formatPHP, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useSettings } from "@/lib/settings";
import { mergeWithdrawalSchedule, releaseDateFor, describeSchedule, formatReleaseDate, relativeReleaseLabel } from "@/lib/withdrawalSchedule";
import {
  useWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  setWithdrawalReleaseDate,
  setWithdrawalProcessedAt,
  setWithdrawalRequestedAt,
  manilaDayStart,
  manilaDateTime,
  toManilaInput,
  type WithdrawalStatus,
  type WithdrawalRequest,
} from "@/lib/withdrawals";

const statusMeta = {
  pending: { label: "Pending", icon: Clock, color: "text-vault", bg: "bg-vault/15" },
  approved: { label: "Approved", icon: Check, color: "text-green", bg: "bg-green/15" },
  rejected: { label: "Rejected", icon: X, color: "text-red", bg: "bg-red/15" },
};
const STATUS_TABS: WithdrawalStatus[] = ["pending", "approved", "rejected"];

export default function AdminWithdrawalsPage() {
  const { user } = useAuth();
  const { rows, loading } = useWithdrawals("all");
  const [tab, setTab] = useHashTab<WithdrawalStatus>(STATUS_TABS, "pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the row whose release / released date is being edited, and the typed value
  // field: the release / released date ("release") or the date the member asked ("requested")
  const [editing, setEditing] = useState<{ id: string; value: string; field?: "release" | "requested" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveDate(r: WithdrawalRequest) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin || !editing) return;
    if (editing.field === "requested") {
      const at = manilaDateTime(editing.value);
      if (at == null) return setError("Pick a date and time first.");
      if (at > Date.now() + 60_000) return setError("A request date can’t be in the future.");
      setBusyId(r.id); setError(null); setNotice(null);
      try {
        await setWithdrawalRequestedAt(db, r, user.uid, at);
        setNotice(`${r.userName}’s request date now reads ${new Date(at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}.${r.status === "pending" ? " Change the release date too if it should move." : ""}`);
        setEditing(null);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not change the date"); }
      finally { setBusyId(null); }
      return;
    }
    const ms = r.status === "pending" ? manilaDayStart(editing.value) : manilaDateTime(editing.value);
    if (ms == null) return setError("Pick a date first.");
    if (r.status === "approved" && ms > Date.now() + 60_000) return setError("A released date can't be in the future.");
    setBusyId(r.id); setError(null); setNotice(null);
    try {
      if (r.status === "pending") { await setWithdrawalReleaseDate(db, r, user.uid, ms); setNotice(`${r.userName}'s release date is now ${formatReleaseDate(ms, { withYear: true })}. They've been told.`); }
      else { await setWithdrawalProcessedAt(db, r, user.uid, ms); setNotice(`${r.userName}'s released date now reads ${new Date(ms).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}.`); }
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change the date"); }
    finally { setBusyId(null); }
  }

  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    }),
    [rows]
  );

  const { settings } = useSettings();
  const schedule = mergeWithdrawalSchedule(settings.withdrawalSchedule);
  const todayStart = (() => { const d = new Date(Date.now() + 8 * 3_600_000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3_600_000; })();
  const releaseOf = (r: { createdAt: number; scheduledReleaseAt?: number | null }) => r.scheduledReleaseAt ?? releaseDateFor(r.createdAt, schedule);

  // Search: name, email, payout account name or number, amount
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/[^0-9]/g, "");
  const matches = (r: WithdrawalRequest) => {
    if (!needle) return true;
    const text = [r.userName, r.userEmail, r.payout?.accountName, r.payout?.provider, r.destination].filter(Boolean).join(" ").toLowerCase();
    if (text.includes(needle)) return true;
    if (digits.length >= 3 && (r.payout?.accountNumber ?? "").includes(digits)) return true;
    return digits.length > 0 && digits === needle.replace(/[₱,.\s]/g, "") && String(Math.round(r.amount)).startsWith(digits);
  };
  const found = needle ? rows.filter(matches) : rows;

  // Pending: due-first, so today's releases sit at the top of the queue.
  const filtered = found
    .filter((r) => r.status === tab)
    .sort((a, b) => (tab === "pending" ? (releaseOf(a) ?? a.createdAt) - (releaseOf(b) ?? b.createdAt) : 0));
  const dueNow = rows.filter((r) => r.status === "pending" && (releaseOf(r) ?? 0) <= todayStart);
  const dueTotal = dueNow.reduce((s, r) => s + r.amount, 0);

  async function approve(id: string) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    setBusyId(id);
    setError(null);
    try {
      await approveWithdrawal(db, id, user.uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    const note = prompt("Reason for rejection (optional):") ?? undefined;
    setBusyId(id);
    setError(null);
    try {
      await rejectWithdrawal(db, id, user.uid, note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <TopHeader
        title="Withdrawal queue"
        subtitle={`${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected · live from Firestore`}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-green/10 border border-green/30 rounded-lg text-[11px] text-green">
          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      <AdminTabs
        tabs={STATUS_TABS.map((k) => ({ id: k, label: statusMeta[k].label, icon: statusMeta[k].icon, count: counts[k], attention: k === "pending" && dueNow.length > 0 }))}
        value={tab}
        onChange={setTab}
      />

      {/* Release schedule + what is due today */}
      <div className={cn("mb-3 flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-lg border", dueNow.length ? "bg-gold/[0.06] border-gold/30" : "bg-card border-border")}>
        <CalendarClock className={cn("w-4 h-4 shrink-0", dueNow.length ? "text-gold" : "text-text-subtle")} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-[12px] m-0 text-text">
            {dueNow.length
              ? <><span className="font-medium text-gold">{dueNow.length} withdrawal{dueNow.length === 1 ? "" : "s"} due for release today</span> · {formatPHP(dueTotal)}</>
              : "Nothing due for release today."}
          </p>
          <p className="text-[10px] text-text-subtle m-0 mt-0.5">{describeSchedule(schedule)}</p>
        </div>
        <Link href="/admin/settings#withdrawal-schedule" className="text-[10px] text-gold hover:underline shrink-0">Edit schedule</Link>
      </div>

      <Card>
        <CardHeader
          title={`${statusMeta[tab].label} withdrawals`}
          right={
            tab === "pending" && counts.pending > 0 ? (
              <span className="text-[10px] text-vault flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Action needed
              </span>
            ) : undefined
          }
        />
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, GCash / account number, amount…"
              className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-2 text-[12px] text-text outline-none focus:border-gold/40"
              aria-label="Search withdrawals"
            />
          </div>
          {needle && (
            <p className="text-[11px] text-text-muted m-0">
              {filtered.length} in {statusMeta[tab].label.toLowerCase()}
              {STATUS_TABS.filter((k) => k !== tab && found.some((r) => r.status === k)).map((k) => (
                <button key={k} type="button" onClick={() => setTab(k)} className="ml-2 text-gold hover:underline">
                  {found.filter((r) => r.status === k).length} in {statusMeta[k].label.toLowerCase()}
                </button>
              ))}
              <button type="button" onClick={() => setQ("")} className="ml-2 text-text-subtle hover:text-text">Clear</button>
            </p>
          )}
        </div>

        {loading && (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 text-vault animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-[11px] text-text-subtle text-center py-8 m-0">
            {needle ? "No withdrawal in this tab matches your search." : "Nothing in this tab."}
          </p>
        )}

        {filtered.map((r, i) => {
          const isBusy = busyId === r.id;
          const releaseAt = r.status === "pending" ? releaseOf(r) : null;
          const due = releaseAt != null && releaseAt <= todayStart;
          const initials =
            (r.userName?.[0] ?? "?").toUpperCase() +
            (r.userName?.split(" ")?.[1]?.[0] ?? "").toUpperCase();
          return (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-3 py-3",
                i < filtered.length - 1 && "border-b border-border"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-card-elev text-[10px] font-medium flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] m-0">{r.userName}</p>
                <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">
                  {r.userEmail}
                  {r.note && <span className="text-vault-muted ml-1">· {r.note}</span>}
                </p>
                <PayoutDetails r={r} />
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-medium font-mono m-0">{formatPHP(r.amount)}</p>
                <p className="text-[9px] text-text-subtle m-0 mt-0.5 flex items-center justify-end gap-1">
                  Asked {formatReleaseDate(r.createdAt)} · {new Date(r.createdAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}
                  {r.status !== "rejected" && (
                    <button
                      onClick={() => { setError(null); setEditing(editing?.id === r.id && editing.field === "requested" ? null : { id: r.id, field: "requested", value: toManilaInput(r.createdAt, true) }); }}
                      disabled={isBusy}
                      className={cn("p-0.5 rounded transition", editing?.id === r.id && editing.field === "requested" ? "text-gold" : "text-text-subtle hover:text-gold")}
                      aria-label={`Edit ${r.userName}’s request date`}
                      title="Edit request date"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                </p>
                {releaseAt != null && (
                  <p className={cn("text-[9px] m-0 mt-0.5 font-medium", due ? "text-gold" : "text-text-muted")}>
                    {due ? "Due" : "Releases"} {formatReleaseDate(releaseAt)} · {relativeReleaseLabel(releaseAt)}
                  </p>
                )}
                {r.status === "approved" && r.processedAt && (
                  <p className="text-[9px] m-0 mt-0.5 font-medium text-green">
                    Released {formatReleaseDate(r.processedAt)} · {new Date(r.processedAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
              </div>
              {tab === "pending" ? (
                <div className="flex gap-1.5 ml-auto sm:ml-0">
                  <button
                    onClick={() => approve(r.id)}
                    disabled={isBusy}
                    className="text-[11px] px-3 py-1.5 bg-green/15 text-green rounded-md flex items-center gap-1.5 hover:bg-green/25 transition disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Approve
                  </button>
                  <button
                    onClick={() => reject(r.id)}
                    disabled={isBusy}
                    className="text-[11px] px-3 py-1.5 bg-card-elev border border-border-strong text-text-muted rounded-md hover:text-red hover:border-red/30 transition flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                  <button
                    onClick={() => { setError(null); setEditing(editing?.id === r.id && editing.field !== "requested" ? null : { id: r.id, field: "release", value: releaseAt != null ? toManilaInput(releaseAt) : toManilaInput(Date.now()) }); }}
                    disabled={isBusy}
                    className={cn("text-[11px] px-3 py-1.5 rounded-md border transition flex items-center gap-1.5 disabled:opacity-60", editing?.id === r.id && editing.field !== "requested" ? "bg-gold/15 border-gold/40 text-gold" : "bg-card-elev border-gold/30 text-gold hover:bg-gold/10")}
                  >
                    <CalendarCog className="w-3 h-3" /> Change date
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md font-medium",
                      statusMeta[r.status].bg,
                      statusMeta[r.status].color
                    )}
                  >
                    {statusMeta[r.status].label}
                  </span>
                  {r.status === "approved" && (
                    <button
                      onClick={() => { setError(null); setEditing(editing?.id === r.id && editing.field !== "requested" ? null : { id: r.id, field: "release", value: toManilaInput(r.processedAt ?? Date.now(), true) }); }}
                      disabled={isBusy}
                      className={cn("text-[10px] px-2 py-1 rounded-md border transition flex items-center gap-1 disabled:opacity-60", editing?.id === r.id && editing.field !== "requested" ? "bg-gold/15 border-gold/40 text-gold" : "bg-card-elev border-border-strong text-text-muted hover:text-text")}
                    >
                      <CalendarCog className="w-3 h-3" /> Edit date
                    </button>
                  )}
                </div>
              )}
              {editing?.id === r.id && editing.field === "requested" && (
                <div className="basis-full flex flex-wrap items-center gap-2 bg-canvas border border-gold/30 rounded-lg px-3 py-2">
                  <span className="text-[11px] text-text-muted">Asked on</span>
                  <input
                    type="datetime-local"
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    className="bg-card border border-border rounded-md px-2 py-1 text-[12px] text-text font-mono outline-none focus:border-gold/40"
                  />
                  {(() => { const ms = manilaDateTime(editing.value); return ms != null ? <span className="text-[11px] text-text-subtle">{formatReleaseDate(ms, { withYear: true })}</span> : null; })()}
                  <button onClick={() => saveDate(r)} disabled={isBusy} className="text-[11px] px-3 py-1 rounded-md bg-gold text-gold-dark font-medium disabled:opacity-60 flex items-center gap-1">{isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save</button>
                  <button onClick={() => setEditing(null)} className="text-[11px] text-text-muted hover:text-text">Cancel</button>
                  <span className="basis-full text-[9px] text-text-subtle">
                    Manila time. Changes the request date the member sees; no notification.{r.createdAtOriginal != null ? ` Originally asked ${new Date(r.createdAtOriginal).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}.` : ""}
                  </span>
                </div>
              )}
              {editing?.id === r.id && editing.field !== "requested" && (
                <div className="basis-full flex flex-wrap items-center gap-2 bg-canvas border border-gold/30 rounded-lg px-3 py-2">
                  <span className="text-[11px] text-text-muted">{r.status === "pending" ? "New release date" : "Released on"}</span>
                  <input
                    type={r.status === "pending" ? "date" : "datetime-local"}
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    className="bg-card border border-border rounded-md px-2 py-1 text-[12px] text-text font-mono outline-none focus:border-gold/40"
                  />
                  {(() => { const ms = r.status === "pending" ? manilaDayStart(editing.value) : manilaDateTime(editing.value); return ms != null ? <span className="text-[11px] text-text-subtle">{formatReleaseDate(ms, { withYear: true })}{r.status === "pending" ? ` · ${relativeReleaseLabel(ms)}` : ""}</span> : null; })()}
                  <button onClick={() => saveDate(r)} disabled={isBusy} className="text-[11px] px-3 py-1 rounded-md bg-gold text-gold-dark font-medium disabled:opacity-60 flex items-center gap-1">{isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save</button>
                  <button onClick={() => setEditing(null)} className="text-[11px] text-text-muted hover:text-text">Cancel</button>
                  <span className="basis-full text-[9px] text-text-subtle">{r.status === "pending" ? "Manila time. The member gets a notification with the new date." : "Manila time. Changes the “Released …” date the member sees; no notification."}</span>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
