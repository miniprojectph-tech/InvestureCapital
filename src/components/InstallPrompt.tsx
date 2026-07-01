"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

const DISMISS_KEY = "investure-install-dismissed";

export function InstallPrompt() {
  const { canInstall, installed, isIos, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until we read storage

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") setDismissed(true);
  }

  // Only surface the banner when the app is actually installable and not yet
  // installed or dismissed. iOS gets the manual hint since it has no prompt.
  const showBanner = !installed && !dismissed && (canInstall || isIos);
  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto">
        <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 shadow-xl shadow-black/50">
          <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4 text-gold" />
          </div>

          {isIos && !canInstall ? (
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

          {canInstall && (
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
