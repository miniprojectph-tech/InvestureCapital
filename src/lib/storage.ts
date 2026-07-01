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
