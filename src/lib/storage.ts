"use client";

import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import { MAX_QR_BYTES, type PaymentMethodId } from "./settings";

export type UploadedQr = {
  url: string;
  path: string;
};

/**
 * Turn a Firebase Storage failure into an actionable message. Most "can't
 * upload" cases are a 403 from Storage rules (not signed in as admin) or from
 * App Check being *enforced* on Cloud Storage while the client sends no token.
 */
export function describeStorageError(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? "");
  const msg = e instanceof Error ? e.message : String(e);
  const hay = `${code} ${msg}`.toLowerCase();
  if (hay.includes("unauthenticated")) {
    return "Not signed in — sign in as an admin and try again.";
  }
  if (hay.includes("unauthorized") || hay.includes("403") || hay.includes("permission")) {
    return "Storage denied this upload (403). Check that you're signed in as an admin, and that Firebase App Check is set to Unenforced for Cloud Storage (App Check → APIs → Cloud Storage) — or that a reCAPTCHA key is configured for this site.";
  }
  if (hay.includes("app-check") || hay.includes("appcheck")) {
    return "Blocked by App Check. Set Cloud Storage to Unenforced in the Firebase console, or configure a reCAPTCHA App Check key for this site.";
  }
  if (hay.includes("retry-limit") || hay.includes("unknown") || hay.includes("network")) {
    return "Couldn't reach Cloud Storage (network, App Check, or CORS). Verify your connection and that App Check isn't blocking Storage.";
  }
  if (hay.includes("quota")) return "Storage quota exceeded for this project.";
  if (hay.includes("canceled")) return "Upload canceled.";
  return msg || "Upload failed";
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

/** Upload a QR image for a payment method. Returns the download URL + storage path. */
export async function uploadPaymentMethodQr(
  storage: FirebaseStorage,
  method: PaymentMethodId,
  file: File
): Promise<UploadedQr> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("QR must be a PNG, JPG, WebP, or GIF image");
  }
  if (file.size > MAX_QR_BYTES) {
    throw new Error(`QR image too large (max ${MAX_QR_BYTES / 1024 / 1024} MB)`);
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `payment-methods/${method}-${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type });
  const url = await getDownloadURL(ref);
  return { url, path };
}

/** Delete a previously uploaded QR. Safe to call with an undefined/missing path. */
export async function deletePaymentMethodQr(
  storage: FirebaseStorage,
  path: string | undefined
): Promise<void> {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch {
    // file may already be gone — ignore
  }
}

const MAX_GAME_IMAGE_BYTES = 2 * 1024 * 1024;

/** Upload a fish or reward image under /fish/* or /rewards/*. Admin-only per rules. */
export async function uploadGameImage(
  storage: FirebaseStorage,
  folder: "fish" | "rewards",
  file: File
): Promise<UploadedQr> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Image must be a PNG, JPG, WebP, or GIF");
  }
  if (file.size > MAX_GAME_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${MAX_GAME_IMAGE_BYTES / 1024 / 1024} MB)`);
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${folder}/${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type });
  const url = await getDownloadURL(ref);
  return { url, path };
}

const MAX_ASSET_BYTES = 25 * 1024 * 1024; // 25 MB — allows short video/audio loops

/**
 * Upload a game skin asset (image, video, or audio) under /game-assets/*.
 * Admin-only per Storage rules.
 */
export async function uploadGameAsset(
  storage: FirebaseStorage,
  file: File
): Promise<UploadedQr> {
  const ok =
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/");
  if (!ok) throw new Error("Must be an image, video, or audio file");
  if (file.size > MAX_ASSET_BYTES) {
    throw new Error(`File too large (max ${MAX_ASSET_BYTES / 1024 / 1024} MB)`);
  }
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `game-assets/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type });
  const url = await getDownloadURL(ref);
  return { url, path };
}

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB — screenshots can be larger than QRs

/**
 * Upload a top-up payment receipt under /receipts/{userId}/{timestamp}.{ext}.
 * Path is namespaced by userId so Storage rules can enforce ownership.
 */
export async function uploadReceipt(
  storage: FirebaseStorage,
  userId: string,
  file: File
): Promise<UploadedQr> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Receipt must be a PNG, JPG, WebP, or GIF image");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error(`Receipt too large (max ${MAX_RECEIPT_BYTES / 1024 / 1024} MB)`);
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `receipts/${userId}/${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type });
  const url = await getDownloadURL(ref);
  return { url, path };
}
