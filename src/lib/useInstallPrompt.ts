"use client";

import { useSyncExternalStore } from "react";

// beforeinstallprompt isn't in the standard DOM lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  /** A deferred install prompt is available (Chromium browsers). */
  canInstall: boolean;
  /** App is installed / running in standalone mode. */
  installed: boolean;
  /** iOS Safari — no programmatic prompt, needs manual Add to Home Screen. */
  isIos: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canInstall: false, installed: false, isIos: false };
const listeners = new Set<() => void>();

const SERVER_STATE: InstallState = { canInstall: false, installed: false, isIos: false };

function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Initialize once at module load (client only). Registering here rather than
// in an effect means we don't miss the beforeinstallprompt event, which can
// fire before React mounts.
if (typeof window !== "undefined") {
  state.isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  state.installed = detectStandalone();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress the mini-infobar; we drive install ourselves
    deferred = e as BeforeInstallPromptEvent;
    state.canInstall = true;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    state.canInstall = false;
    state.installed = true;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_STATE;
}

/** Trigger the native install prompt. Returns the outcome, or "unavailable". */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  state.canInstall = false;
  emit();
  return outcome;
}

export function useInstallPrompt() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...s, promptInstall };
}
