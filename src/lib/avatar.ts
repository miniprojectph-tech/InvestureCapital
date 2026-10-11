"use client";

import { doc, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { getFirebase } from "./firebase";

/**
 * Profile pictures. The browser crops the chosen image to a square and shrinks
 * it to 256 px before upload, so a photo weighs ~20 KB. It is stored at
 * profile-pictures/{uid}/avatar.jpg (Storage rules: owner writes, signed-in
 * reads, images under 5 MB) and its link saved on users/{uid}.profile.photoURL,
 * which the owner may edit under the Firestore rules.
 */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_INPUT = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Centre-crop to a square and resize; returns a JPEG blob. */
export async function squareJpeg(file: File, size = AVATAR_SIZE): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Choose a JPG, PNG, WebP or GIF picture.");
  if (file.size > AVATAR_MAX_INPUT) throw new Error("That picture is over 5 MB. Choose a smaller one.");
  const bitmap = await loadImage(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2, sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize pictures.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.86));
  if (!blob) throw new Error("Couldn't prepare the picture.");
  return blob;
}
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions); } catch { /* fall through */ }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That file isn't a picture we can read.")); };
    img.src = url;
  });
}

/** Upload the member's new picture and save its link on their profile. Returns the URL. */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  const { db, storage } = getFirebase();
  if (!db || !storage) throw new Error("Not connected.");
  const blob = await squareJpeg(file);
  const ref = storageRef(storage, `profile-pictures/${uid}/avatar.jpg`);
  await uploadBytes(ref, blob, { contentType: "image/jpeg", cacheControl: "public, max-age=3600" });
  // a changing query string makes every browser fetch the new picture instead of a cached one
  const url = `${await getDownloadURL(ref)}&v=${Date.now()}`;
  await updateDoc(doc(db, "users", uid), { "profile.photoURL": url, "profile.photoUpdatedAt": Date.now() });
  return url;
}

/** Back to initials: clear the link (and delete the file when the caller owns it). */
export async function removeAvatar(uid: string, deleteFile = true): Promise<void> {
  const { db, storage } = getFirebase();
  if (!db) throw new Error("Not connected.");
  await updateDoc(doc(db, "users", uid), { "profile.photoURL": null, "profile.photoUpdatedAt": Date.now() });
  if (deleteFile && storage) await deleteObject(storageRef(storage, `profile-pictures/${uid}/avatar.jpg`)).catch(() => {});
}
