import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./init";

/**
 * Help & FAQ votes. Members can't write the counters directly (they'd be
 * forgeable), so this callable records one vote per member per question in
 * `faq_voters/{uid}` and keeps the totals in `content/faqVotes`
 * (`{ [id]: { up, down } }`), both in one transaction.
 */
export const faqVote = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const uid = request.auth.uid;
  const { id, helpful } = (request.data ?? {}) as { id?: unknown; helpful?: unknown };
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new HttpsError("invalid-argument", "Bad question id.");
  if (helpful !== true && helpful !== false && helpful !== null) throw new HttpsError("invalid-argument", "helpful must be true, false or null.");

  const votersRef = db.collection("faq_voters").doc(uid);
  const totalsRef = db.collection("content").doc("faqVotes");
  const faqRef = db.collection("content").doc("faq");

  await db.runTransaction(async (tx) => {
    const [voters, faq] = await Promise.all([tx.get(votersRef), tx.get(faqRef)]);
    const items = (faq.data()?.items ?? []) as { id: string; status: string }[];
    if (!items.some((it) => it.id === id && it.status === "published")) throw new HttpsError("not-found", "Question not found.");

    const prev = voters.data()?.[id];
    const before: boolean | null = prev === true ? true : prev === false ? false : null;
    if (before === helpful) return;

    // Nested map + merge (a dotted key in set() would be a literal field name).
    const upDelta = (before === true ? -1 : 0) + (helpful === true ? 1 : 0);
    const downDelta = (before === false ? -1 : 0) + (helpful === false ? 1 : 0);
    tx.set(totalsRef, { [id]: { up: FieldValue.increment(upDelta), down: FieldValue.increment(downDelta) } }, { merge: true });
    tx.set(votersRef, { [id]: helpful === null ? FieldValue.delete() : helpful }, { merge: true });
  });
  return { ok: true };
});
