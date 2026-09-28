"use client";

import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";

export type MemberExportFilter = "all" | "active" | "noPayout" | "withPayout";
export type MemberExportFormat = "xlsx" | "csv";

export const MEMBER_FILTER_LABEL: Record<MemberExportFilter, string> = {
  all: "All members",
  active: "With active placements",
  withPayout: "With a mode of payout",
  noPayout: "No mode of payout yet",
};

export type MemberExportRow = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  joinedAt: number | null;
  payoutMode: string;
  payoutAccountName: string;
  payoutAccountNumber: string;
  payoutBank: string;
  wallet: number;
  activePlacements: number;
  activeCapital: number;
  sponsor: string;
  referralCode: string;
  role: "Admin" | "Member";
};

type Result = { ok: boolean; filter: MemberExportFilter; generatedAt: number; total: number; rows: MemberExportRow[] };

/** Column order, header text and width (in characters) of the exported sheet. */
const COLUMNS: { header: string; width: number; get: (r: MemberExportRow) => string | number; text?: boolean; money?: boolean }[] = [
  { header: "Name", width: 28, get: (r) => r.name },
  { header: "Email", width: 32, get: (r) => r.email },
  // Stored as TEXT so Excel keeps the leading 0 and never shows 9.17E+09.
  { header: "Phone number", width: 16, get: (r) => r.phone, text: true },
  { header: "Mode of payout", width: 16, get: (r) => r.payoutMode },
  { header: "Payout account name", width: 28, get: (r) => r.payoutAccountName },
  { header: "Payout account number", width: 22, get: (r) => r.payoutAccountNumber, text: true },
  { header: "Bank", width: 18, get: (r) => r.payoutBank },
  { header: "Date joined", width: 14, get: (r) => (r.joinedAt ? manilaDate(r.joinedAt) : ""), text: true },
  { header: "Wallet (PHP)", width: 14, get: (r) => r.wallet, money: true },
  { header: "Active placements", width: 17, get: (r) => r.activePlacements },
  { header: "Active capital (PHP)", width: 19, get: (r) => r.activeCapital, money: true },
  { header: "Sponsor", width: 26, get: (r) => r.sponsor },
  { header: "Referral code", width: 15, get: (r) => r.referralCode, text: true },
  { header: "Role", width: 10, get: (r) => r.role },
];

function manilaDate(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

function fileStamp(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ask the server for the member rows (admin-only, audited), then build the file
 * in the browser and download it. Returns how many members were exported.
 */
export async function exportMembers(filter: MemberExportFilter, format: MemberExportFormat): Promise<number> {
  const { functions } = getFirebase();
  if (!functions) throw new Error("Export isn't available right now.");
  const res = await httpsCallable<{ filter: MemberExportFilter }, Result>(functions, "adminExportMembers")({ filter });
  const { rows, generatedAt } = res.data;
  const base = `investure-members_${filter}_${fileStamp(generatedAt)}`;

  if (format === "csv") {
    // A leading apostrophe-free trick for CSV: wrap number-like text as ="…" so
    // Excel keeps leading zeros when the file is opened by double-click.
    const esc = (v: string | number, text?: boolean) => {
      const s = String(v ?? "");
      if (text && /^\d+$/.test(s)) return `"=""${s}"""`;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [COLUMNS.map((c) => esc(c.header)).join(","), ...rows.map((r) => COLUMNS.map((c) => esc(c.get(r), c.text)).join(","))];
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }), `${base}.csv`);
    return rows.length;
  }

  // Loaded only when an admin actually exports, so it never weighs on member pages.
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = COLUMNS.map((c) => ({ value: c.header, fontWeight: "bold" as const, backgroundColor: "#E8F5EE" }));
  const body = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = c.get(r);
      if (c.money) return { value: Number(v) || 0, type: Number, format: "#,##0.00" };
      if (c.text || typeof v === "string") return { value: String(v ?? ""), type: String };
      return { value: Number(v) || 0, type: Number };
    }),
  );
  const blob = await writeExcelFile([header, ...body], {
    sheet: "Members",
    columns: COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toBlob();
  download(blob, `${base}.xlsx`);
  return rows.length;
}
