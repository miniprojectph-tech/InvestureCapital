"use client";

import type { PlanRequest } from "@/lib/planRequests";
import type { PlacementRow } from "@/lib/adminQueries";

/**
 * Admin › Placement requests › Approved: every placement that went live, from
 * either side —
 *   paid in  = an approved request (receipt) or a manual activation by an admin
 *   wallet   = the member reinvested from their income wallet (incl. event slots)
 * Approved requests come from plan_requests; placements made without a request
 * (wallet reinvests, manual activations) come from the member records.
 */
export type PlacedSource = "paid" | "wallet";
export type PlacedRow = {
  key: string;
  at: number;
  userId: string;
  userName: string;
  userEmail: string;
  placementId?: string;
  amount: number;
  termMonths?: number;
  source: PlacedSource;
  method: string;
  reference?: string;
  event?: string;
  status: "active" | "completed" | "";
  approvedBy: string;
  request?: PlanRequest;
};

export function buildPlacedRows(approved: PlanRequest[], placements: PlacementRow[], nameOf: (uid: string) => string): PlacedRow[] {
  const byKey = new Map(placements.map((p) => [`${p.userId}:${p.id}`, p]));
  const linked = new Set<string>();
  const requestIds = new Set(approved.map((r) => r.id));
  const rows: PlacedRow[] = [];

  for (const r of approved) {
    const k = r.placementId ? `${r.userId}:${r.placementId}` : "";
    const p = k ? byKey.get(k) : undefined;
    if (k) linked.add(k);
    rows.push({
      key: `r:${r.id}`,
      at: r.processedAt ?? r.createdAt,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      placementId: r.placementId,
      amount: r.amount,
      termMonths: r.termMonths,
      source: "paid",
      method: r.methodLabel,
      reference: r.referenceNumber,
      event: r.event?.name,
      status: p ? p.status : "",
      approvedBy: r.processedBy ? nameOf(r.processedBy) : "",
      request: r,
    });
  }

  for (const p of placements) {
    const k = `${p.userId}:${p.id}`;
    if (linked.has(k) || (p.requestId && requestIds.has(p.requestId))) continue;
    const wallet = p.source === "wallet";
    rows.push({
      key: `p:${k}`,
      at: p.originalStartedAt ?? p.startedAt,
      userId: p.userId,
      userName: p.userName,
      userEmail: p.userEmail,
      placementId: p.id,
      amount: p.capital,
      termMonths: p.termMonths,
      source: wallet ? "wallet" : "paid",
      method: wallet ? "Income wallet" : "Manual (admin)",
      event: p.event?.name,
      status: p.status,
      approvedBy: wallet ? "Member (self)" : "",
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

// ----- date ranges (Manila days, weeks start Monday) -----
export type RangeKey = "all" | "today" | "week" | "month" | "lastMonth" | "custom";
export const RANGE_LABEL: Record<RangeKey, string> = { all: "All time", today: "Today", week: "This week", month: "This month", lastMonth: "Last month", custom: "Custom dates" };
const OFFSET = 8 * 3_600_000;
const DAY = 86_400_000;
const manilaMidnight = (ms: number) => Math.floor((ms + OFFSET) / DAY) * DAY - OFFSET;

/** [from, to) in ms for a preset, or for custom "YYYY-MM-DD" inputs (inclusive days). */
export function rangeBounds(key: RangeKey, now: number, from?: string, to?: string): [number, number] {
  const today = manilaMidnight(now);
  const d = new Date(now + OFFSET);
  const monthStart = (y: number, m: number) => Date.UTC(y, m, 1) - OFFSET;
  switch (key) {
    case "today": return [today, today + DAY];
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      return [today - dow * DAY, today + DAY];
    }
    case "month": return [monthStart(d.getUTCFullYear(), d.getUTCMonth()), today + DAY];
    case "lastMonth": return [monthStart(d.getUTCFullYear(), d.getUTCMonth() - 1), monthStart(d.getUTCFullYear(), d.getUTCMonth())];
    case "custom": {
      const parse = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) - OFFSET : NaN);
      const a = parse(from), b = parse(to);
      return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b + DAY : Number.MAX_SAFE_INTEGER];
    }
    default: return [0, Number.MAX_SAFE_INTEGER];
  }
}

export const manilaStamp = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 16).replace("T", " ");

const SOURCE_LABEL: Record<PlacedSource, string> = { paid: "Paid in", wallet: "Wallet reinvest" };
const COLUMNS: { header: string; width: number; get: (r: PlacedRow) => string | number; money?: boolean }[] = [
  { header: "Date (Manila)", width: 17, get: (r) => manilaStamp(r.at) },
  { header: "Member", width: 26, get: (r) => r.userName },
  { header: "Email", width: 30, get: (r) => r.userEmail },
  { header: "Plan ID", width: 12, get: (r) => r.placementId ?? "" },
  { header: "Amount (PHP)", width: 14, get: (r) => r.amount, money: true },
  { header: "Term (months)", width: 13, get: (r) => r.termMonths ?? "" },
  { header: "Source", width: 16, get: (r) => SOURCE_LABEL[r.source] },
  { header: "Payment method", width: 18, get: (r) => r.method },
  { header: "Reference", width: 18, get: (r) => r.reference ?? "" },
  { header: "Event", width: 20, get: (r) => r.event ?? "" },
  { header: "Status", width: 11, get: (r) => r.status },
  { header: "Approved by", width: 20, get: (r) => r.approvedBy },
];

/** Build the .xlsx in the browser (the library loads only when an admin downloads). */
export async function downloadPlacedExcel(rows: PlacedRow[], fileLabel: string): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = COLUMNS.map((c) => ({ value: c.header, fontWeight: "bold" as const, backgroundColor: "#E8F5EE" }));
  const body = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = c.get(r);
      if (c.money) return { value: Number(v) || 0, type: Number, format: "#,##0.00" };
      if (typeof v === "number") return { value: v, type: Number };
      return { value: String(v ?? ""), type: String };
    }),
  );
  const totals = [
    { value: "Total", fontWeight: "bold" as const }, null, null, null,
    { value: rows.reduce((s, r) => s + r.amount, 0), type: Number, format: "#,##0.00", fontWeight: "bold" as const },
    ...COLUMNS.slice(5).map(() => null),
  ];
  const blob = await writeExcelFile([header, ...body, totals], {
    sheet: "Placements",
    columns: COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investure-placements_${fileLabel}_${manilaStamp(Date.now()).replace(" ", "_").replace(":", "")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
