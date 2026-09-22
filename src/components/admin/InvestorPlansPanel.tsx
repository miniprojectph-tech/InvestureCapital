"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Zap, Loader2, SkipForward, FastForward, CalendarClock, RotateCcw, CheckCircle2, AlertCircle, Clock, X, Check } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { formatPHP, cn } from "@/lib/utils";
import { getFirebase } from "@/lib/firebase";
import { listAllPlacements, type InvestorRow, type PlacementRow } from "@/lib/adminQueries";
import {
  useNow,
  useTestClocks,
  nextPayoutAt,
  placementPerCycle,
  formatCountdown,
  toDateInput,
  fromDateInput,
  adminAdvancePlacement,
  adminSetPlacementStart,
  adminResetMember,
  adminSetTestClock,
  placementClock,
  peso,
  TEST_CLOCK_LABEL,
  type TestClockSpeed,
} from "@/lib/compplan";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

/**
 * Admin › Investors › Plans. Per member: placements, the accelerated TEST CLOCK
 * toggle, and per-placement test/ops tools (next payout, complete now, edit
 * start date) plus a per-member reset.
 */
export function InvestorPlansPanel({ investors, onChanged }: { investors: InvestorRow[]; onChanged: () => void }) {
  const now = useNow(15_000);
  const clocks = useTestClocks(true);
  const [placements, setPlacements] = useState<PlacementRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ key: string; date: string } | null>(null);

  const load = useCallback(async () => {
    const { db } = getFirebase();
    if (!db) { setPlacements([]); return; }
    try {
      setPlacements(await listAllPlacements(db));
    } catch {
      setPlacements([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // While any test clock runs, payouts land every minute — keep the table fresh.
  useEffect(() => {
    if (clocks.size === 0) return;
    const t = setInterval(() => { load(); onChanged(); }, 20_000);
    return () => clearInterval(t);
  }, [clocks.size, load, onChanged]);

  const byUser = useMemo(() => {
    const m = new Map<string, PlacementRow[]>();
    for (const p of placements ?? []) {
      if (!m.has(p.userId)) m.set(p.userId, []);
      m.get(p.userId)!.push(p);
    }
    return m;
  }, [placements]);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ ok: true, text });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(null);
    }
  }

  // Per placement. Without a placementId it applies to every active placement of the member.
  const setClock = (u: InvestorRow, speed: TestClockSpeed | null, placementId?: string) =>
    run(`clock-${u.uid}-${placementId ?? "all"}`, async () => {
      const r = await adminSetTestClock(u.uid, speed, placementId);
      const what = placementId ?? `all ${r.placements.length} placement${r.placements.length === 1 ? "" : "s"}`;
      return speed
        ? `${what} on the ${speed} test clock (${TEST_CLOCK_LABEL[speed]}). It switches off by itself after that placement's final payout; ${u.name}'s other placements keep real time.`
        : `Test clock off for ${what} — it continues at normal speed from where it is.`;
    });

  return (
    <Card>
      <CardHeader
        title={`Plan activity (${investors.length})`}
        subtitle="Placements, earnings and test tools — open a member to fast-forward, fix a start date, or reset them"
        right={clocks.size > 0 ? (
          <span className="text-[10px] font-medium bg-gold/15 text-gold px-2 py-1 rounded-full flex items-center gap-1">
            <Zap className="w-3 h-3" /> {clocks.size} on test clock
          </span>
        ) : undefined}
      />

      {msg && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-start gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {msg.text}
        </p>
      )}

      <ResponsiveTable>
        <table className="w-full text-[11px] min-w-[900px]">
          <thead>
            <tr className="text-text-subtle text-left">
              <th className="font-normal py-2 px-1 w-6" />
              <th className="font-normal py-2 px-1">Name</th>
              <th className="font-normal py-2 px-1">Email</th>
              <th className="font-normal py-2 px-1 text-right">Active</th>
              <th className="font-normal py-2 px-1 text-right">Deployed</th>
              <th className="font-normal py-2 px-1 text-right">Completed</th>
              <th className="font-normal py-2 px-1 text-right">Total Earned</th>
              <th className="font-normal py-2 px-1">Test clock</th>
            </tr>
          </thead>
          <tbody>
            {investors.map((u) => {
              const mine = byUser.get(u.uid) ?? [];
              const clock = clocks.get(u.uid);
              const activeMine = mine.filter((p) => p.status === "active");
              const onClock = activeMine.filter((p) => placementClock(clock, p.id)).length;
              const isOpen = open === u.uid;
              const clockBusy = busy === `clock-${u.uid}-all`;
              return (
                <Fragment key={u.uid}>
                  <tr className={cn("border-t border-border transition", isOpen ? "bg-card-elev/40" : "hover:bg-card-elev/50")}>
                    <td className="py-2 px-1 max-md:!hidden">
                      <button onClick={() => setOpen(isOpen ? null : u.uid)} className="text-text-subtle hover:text-text" aria-label={isOpen ? "Collapse" : "Expand"}>
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="py-2 px-1"><button onClick={() => setOpen(isOpen ? null : u.uid)} className="m-0 text-[11px] font-medium text-left hover:text-gold inline-flex items-center gap-1">{u.name}<ChevronDown className={cn("w-3 h-3 md:hidden transition-transform", isOpen && "rotate-180")} /></button></td>
                    <td className="py-2 px-1 text-[10px] text-text-muted">{u.email}</td>
                    <td className="py-2 px-1 text-right font-mono">{u.activePlansCount > 0 ? <span className="text-green">{u.activePlansCount}</span> : <span className="text-text-subtle">0</span>}</td>
                    <td className="py-2 px-1 text-right font-mono text-green">{formatPHP(u.deployed, { short: true })}</td>
                    <td className="py-2 px-1 text-right font-mono">{u.completedPlansCount}</td>
                    <td className="py-2 px-1 text-right font-mono text-vault">{u.totalEarned > 0 ? `+${formatPHP(u.totalEarned, { short: true })}` : formatPHP(0)}</td>
                    <td className="py-2 px-1">
                      {/* Summary only — the Fast / Medium switches live on each plan row below. */}
                      {onClock > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-semibold bg-gold/15 text-gold px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                            <Zap className="w-2.5 h-2.5" /> {onClock} of {activeMine.length} plan{activeMine.length === 1 ? "" : "s"}
                          </span>
                          <button onClick={() => setClock(u, null)} disabled={clockBusy} title="Stop every test clock for this member" className="text-[9px] px-1.5 py-0.5 rounded-md bg-card-elev text-text-muted hover:text-red disabled:opacity-50">
                            {clockBusy ? "…" : "All off"}
                          </button>
                        </div>
                      ) : activeMine.length > 0 ? (
                        <button onClick={() => setOpen(u.uid)} className="text-[9px] text-text-subtle hover:text-gold">per plan ▸</button>
                      ) : (
                        <span className="text-[9px] text-text-subtle">—</span>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-card-elev/20">
                      <td />
                      <td colSpan={7} className="pb-3 pt-1 px-1">
                        {placements === null ? (
                          <Loader2 className="w-4 h-4 text-gold animate-spin my-2" />
                        ) : mine.length === 0 ? (
                          <p className="text-[11px] text-text-subtle m-0 mb-2">No placements. Grant one from Placement requests → Manual activate.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5 mb-2">
                            {mine.map((p) => {
                              const key = `${u.uid}-${p.id}`;
                              const active = p.status === "active";
                              const isEditing = editing?.key === key;
                              const pc = active ? placementClock(clock, p.id) : null;
                              const pcBusy = busy === `clock-${u.uid}-${p.id}`;
                              return (
                                <div key={key} className="bg-canvas border border-border rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                                  <div className="min-w-[150px]">
                                    <p className="m-0 font-mono text-[12px] text-text">
                                      {p.id} <span className="font-sans text-[10px] text-text-subtle">· {p.termMonths} mo · {formatPHP(p.capital, { short: true })}</span>
                                    </p>
                                    <p className="m-0 text-[9px] text-text-subtle">
                                      Started {fmtDate(p.startedAt)}
                                      {p.originalStartedAt && p.originalStartedAt !== p.startedAt ? ` (was ${fmtDate(p.originalStartedAt)})` : ""}
                                    </p>
                                  </div>
                                  <div className="min-w-[130px]">
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-[3px] bg-border rounded-full overflow-hidden"><div className={cn("h-full", active ? "bg-green" : "bg-blue")} style={{ width: `${(p.cyclesPaid / p.cycles) * 100}%` }} /></div>
                                      <span className="font-mono text-text-muted">{p.cyclesPaid}/{p.cycles}</span>
                                    </div>
                                    <p className="m-0 text-[9px] text-text-subtle">
                                      {peso(placementPerCycle(p))} each{p.lockedBonus > 0 ? ` · bonus ${formatPHP(p.lockedBonus, { short: true })}` : ""}
                                    </p>
                                  </div>
                                  <div className="text-[10px] text-text-muted min-w-[120px]">
                                    {active ? (
                                      pc ? (
                                        <span className="text-gold flex items-center gap-1"><Zap className="w-3 h-3" /> {TEST_CLOCK_LABEL[pc.speed]}</span>
                                      ) : (
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> next in {formatCountdown(nextPayoutAt(p) - now)}</span>
                                      )
                                    ) : (
                                      <span className="text-blue">Completed {p.completedAt ? fmtDate(p.completedAt) : ""}</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 ml-auto flex-wrap">
                                    {isEditing ? (
                                      <>
                                        <input
                                          type="date"
                                          value={editing.date}
                                          onChange={(e) => setEditing({ key, date: e.target.value })}
                                          className="bg-card border border-border rounded-md px-2 py-1 text-[11px] text-text outline-none focus:border-gold/40 [color-scheme:dark]"
                                        />
                                        <button
                                          onClick={() =>
                                            run(`start-${key}`, async () => {
                                              const r = await adminSetPlacementStart({ userId: u.uid, placementId: p.id, startedAt: fromDateInput(editing.date, p.startedAt) });
                                              setEditing(null);
                                              return `${p.id}: start date set to ${fmtDate(fromDateInput(editing.date, p.startedAt))} — ${r.redated} history record${r.redated === 1 ? "" : "s"} re-dated${r.payouts ? `, ${r.payouts} payout${r.payouts === 1 ? "" : "s"} now due and credited` : ""}.`;
                                            })
                                          }
                                          disabled={busy !== null || !editing.date}
                                          className="p-1 rounded-md bg-green/15 text-green hover:bg-green/25 disabled:opacity-50"
                                          aria-label="Save start date"
                                        >
                                          {busy === `start-${key}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <button onClick={() => setEditing(null)} className="p-1 rounded-md text-text-subtle hover:text-text" aria-label="Cancel"><X className="w-3.5 h-3.5" /></button>
                                      </>
                                    ) : (
                                      <>
                                        {active && (
                                          <>
                                            {/* Test clock for THIS plan only */}
                                            {pc ? (
                                              <button
                                                onClick={() => setClock(u, null, p.id)}
                                                disabled={busy !== null}
                                                title="Stop the test clock for this plan"
                                                className="text-[10px] px-2 py-1 rounded-md bg-gold/15 border border-gold/40 text-gold hover:bg-red/10 hover:text-red hover:border-red/30 inline-flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                                              >
                                                {pcBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} {pc.speed} · off
                                              </button>
                                            ) : (
                                              (["fast", "medium"] as TestClockSpeed[]).map((s) => (
                                                <button
                                                  key={s}
                                                  onClick={() => setClock(u, s, p.id)}
                                                  disabled={busy !== null}
                                                  title={`Test clock for ${p.id}: ${TEST_CLOCK_LABEL[s]}`}
                                                  className="text-[10px] px-2 py-1 rounded-md bg-card-elev border border-border text-text-muted hover:text-gold hover:border-gold/40 inline-flex items-center gap-1 capitalize disabled:opacity-50"
                                                >
                                                  {pcBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} {s}
                                                </button>
                                              ))
                                            )}
                                            <ToolButton
                                              icon={SkipForward}
                                              label="Next payout"
                                              busy={busy === `next-${key}`}
                                              disabled={busy !== null}
                                              onClick={() => run(`next-${key}`, async () => { const r = await adminAdvancePlacement({ userId: u.uid, placementId: p.id, mode: "next" }); return `${p.id}: ${r.payouts} payout${r.payouts === 1 ? "" : "s"} credited${r.completed ? " — placement completed" : ""}.`; })}
                                            />
                                            <ToolButton
                                              icon={FastForward}
                                              label="Complete now"
                                              busy={busy === `done-${key}`}
                                              disabled={busy !== null}
                                              onClick={() => run(`done-${key}`, async () => { const r = await adminAdvancePlacement({ userId: u.uid, placementId: p.id, mode: "complete" }); return `${p.id}: ${r.payouts} payout${r.payouts === 1 ? "" : "s"} credited, capital${p.lockedBonus > 0 ? " + Locked-In Bonus" : ""} returned.`; })}
                                            />
                                          </>
                                        )}
                                        <ToolButton icon={CalendarClock} label="Edit start date" disabled={busy !== null} onClick={() => setEditing({ key, date: toDateInput(p.startedAt) })} />
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            if (!window.confirm(`Reset ${u.name}? This wipes their wallet, placements, history and notifications, and reverses the commissions/bonuses their placements paid to uplines. The account itself is kept.`)) return;
                            run(`reset-${u.uid}`, async () => { const r = await adminResetMember(u.uid); return `${u.name} reset — ${r.reversedCommissions} upline commission record${r.reversedCommissions === 1 ? "" : "s"} reversed.`; });
                          }}
                          disabled={busy !== null}
                          className="text-[10px] px-2.5 py-1 rounded-md bg-red/10 text-red border border-red/25 hover:bg-red/20 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busy === `reset-${u.uid}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Reset this member
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {investors.length === 0 && (
              <tr><td colSpan={8} className="text-center text-text-subtle py-8">No investors match your search.</td></tr>
            )}
          </tbody>
        </table>
      </ResponsiveTable>

      <p className="text-[9px] text-text-subtle m-0 mt-3 leading-relaxed">
        <span className="text-gold">Test clock</span> is set per plan (Fast / Medium on the plan row): only that plan runs on accelerated time and credits real payouts through the normal engine, while the member&apos;s other plans keep the real calendar; it switches off by itself once that plan&apos;s final payout (capital back) is credited.
        Fast-forward and the test clock never change a placement&apos;s start date — history is always dated by the schedule. <span className="text-text-muted">Edit start date</span> moves the whole schedule, and every history date of that placement follows.
      </p>
    </Card>
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled, busy }: { icon: typeof Zap; label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-[10px] px-2 py-1 rounded-md bg-card-elev border border-border text-text-muted hover:text-gold hover:border-gold/40 inline-flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />} {label}
    </button>
  );
}
