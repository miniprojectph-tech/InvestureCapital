"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";

// beforeinstallprompt isn't in the standard DOM lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "investure-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    function onBeforeInstall(e: Event) {
      e.preventDefault(); // stop the mini-infobar; we drive install ourselves
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires beforeinstallprompt — show manual instructions instead.
    if (isIos()) {
      setShowIosHint(true);
      setVisible(true);
    }

    function onInstalled() {
      setVisible(false);
      setDeferred(null);
    }
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferred(null);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto">
        <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 shadow-xl shadow-black/50">
          <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4 text-gold" />
          </div>

          {showIosHint ? (
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium m-0">Install Investure</p>
              <p className="text-[10px] text-text-subtle m-0 mt-0.5 flex items-center gap-1 flex-wrap">
                Tap <Share className="w-3 h-3 inline shrink-0" /> then
                <span className="inline-flex items-center gap-0.5">
                  “Add to Home Screen” <Plus className="w-3 h-3 inline shrink-0" />
                </span>
              </p>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium m-0">Install Investure</p>
              <p className="text-[10px] text-text-subtle m-0 mt-0.5">
                Add to your home screen for a full-screen app experience.
              </p>
            </div>
          )}

          {!showIosHint && (
            <button
              onClick={install}
              className="shrink-0 text-[11px] font-medium px-3 py-1.5 bg-gold text-gold-dark rounded-lg hover:brightness-110 transition"
            >
              Install
            </button>
          )}

          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-text-muted hover:text-text transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
