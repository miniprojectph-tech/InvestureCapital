"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./firebase";
import { useAuth } from "./auth";
import type { EmailContent } from "./emailTemplate";

/**
 * Email marketing (admin). Sending happens in Cloud Functions through Resend;
 * this file is the admin page's side of it. The Resend API key is typed by the
 * admin and stored in the admin-only record `admin_private/email`.
 */

export type EmailAudience = "all" | "active" | "noPlacement";

export const AUDIENCE_LABELS: Record<EmailAudience, string> = {
  all: "Every member",
  active: "Members with an active placement",
  noPlacement: "Members with no placement yet",
};

export type EmailStatus = {
  hasKey: boolean;
  keyHint: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  configured: boolean;
  domains: { name: string; status: string }[] | null;
  fromDomainVerified: boolean | null;
  problem: string;
  note: string;
};

export type AudienceCount = { audience: EmailAudience; willSend: number; matched: number; optedOut: number; noEmail: number };

export type SendResult =
  | { ok: boolean; test: true; sentTo: string }
  | { ok: boolean; test?: false; id: string; status: "sent" | "partial" | "failed"; sent: number; failed: number; total: number; error: string };

export type EmailCampaign = {
  id: string;
  subject: string;
  audience: EmailAudience;
  total: number;
  sent: number;
  failed: number;
  optedOut?: number;
  status: "sending" | "sent" | "partial" | "failed";
  error?: string;
  byName?: string;
  at: number;
  finishedAt?: number;
};

function call<I, O>(name: string, data: I): Promise<O> {
  const { functions } = getFirebase();
  if (!functions) return Promise.reject(new Error("Firebase not initialized"));
  // Campaigns to many members take a while — allow the full server time.
  return httpsCallable<I, O>(functions, name, { timeout: 540_000 })(data).then((r) => r.data);
}

export const getEmailStatus = () => call<Record<string, never>, EmailStatus>("adminEmailStatus", {});
export const countAudience = (audience: EmailAudience) => call<{ audience: EmailAudience }, AudienceCount>("adminEmailAudience", { audience });
export const sendTestEmail = (content: EmailContent) => call<{ content: EmailContent; test: true }, SendResult>("adminSendEmail", { content, test: true });
export const sendCampaign = (content: EmailContent, audience: EmailAudience) =>
  call<{ content: EmailContent; audience: EmailAudience }, SendResult>("adminSendEmail", { content, audience });

/** Save the sender details; the API key only when a new one was typed. */
export async function saveEmailSetup(input: { apiKey?: string; fromName: string; fromEmail: string; replyTo: string }, uid: string): Promise<void> {
  const { db } = getFirebase();
  if (!db) throw new Error("Firebase not initialized");
  const patch: Record<string, unknown> = {
    fromName: input.fromName.trim().slice(0, 60),
    fromEmail: input.fromEmail.trim().toLowerCase().slice(0, 120),
    replyTo: input.replyTo.trim().toLowerCase().slice(0, 120),
    updatedAt: Date.now(),
    updatedBy: uid,
  };
  if (input.apiKey && input.apiKey.trim()) patch.apiKey = input.apiKey.trim();
  await setDoc(doc(db, "admin_private", "email"), patch, { merge: true });
}

export function useEmailCampaigns(enabled: boolean): EmailCampaign[] {
  const { user } = useAuth();
  const [list, setList] = useState<EmailCampaign[]>([]);
  useEffect(() => {
    if (!user || !enabled) return;
    const { db } = getFirebase();
    if (!db) return;
    return onSnapshot(
      query(collection(db, "email_campaigns"), orderBy("at", "desc"), limit(20)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmailCampaign, "id">) }))),
      () => setList([]),
    );
  }, [user, enabled]);
  return list;
}

/** Member: switch marketing email on or off for their own account. */
export async function setEmailOptOut(uid: string, optOut: boolean): Promise<void> {
  const { db } = getFirebase();
  if (!db) throw new Error("Firebase not initialized");
  await setDoc(doc(db, "users", uid), { emailOptOut: optOut }, { merge: true });
}
