"use client";

import { useState } from "react";
import { Download, CheckCircle2, Share, Plus, Smartphone } from "lucide-react";
import { Card, CardHeader } from "./Card";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

export function InstallAppCard() {
  const { canInstall, installed, isIos, promptInstall } = useInstallPrompt();
  const [status, setStatus] = useState<string | null>(null);

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "dismissed") setStatus("Install cancelled — you can try again anytime.");
    if (outcome === "unavailable") {
      setStatus("Use your browser menu to add Investure to your home screen.");
    }
  }

  return (
    <Card>
      <CardHeader title="Install app" subtitle="Get a full-screen, app-like experience" />

      {installed ? (
        <div className="flex items-center gap-3 px-3 py-3 bg-green/5 border border-green/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green shrink-0" />
          <p className="text-[12px] m-0">Investure is installed on this device.</p>
        </div>
      ) : canInstall ? (
        <button
          onClick={install}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110 transition"
        >
          <span className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5" />
            Install Investure
          </span>
          <span className="text-[10px] opacity-80">Add to home screen</span>
        </button>
      ) : isIos ? (
        <div className="flex items-start gap-3 px-3 py-3 bg-canvas border border-border rounded-lg">
          <Smartphone className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
          <p className="text-[11px] text-text-muted m-0 leading-relaxed">
            In Safari, tap the{" "}
            <Share className="w-3 h-3 inline mx-0.5 -mt-0.5" /> Share button, then choose{" "}
            <span className="text-text">
              Add to Home Screen <Plus className="w-3 h-3 inline -mt-0.5" />
            </span>
            .
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 px-3 py-3 bg-canvas border border-border rounded-lg">
          <Download className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
          <p className="text-[11px] text-text-muted m-0 leading-relaxed">
            Open your browser menu and choose{" "}
            <span className="text-text">Install app</span> or{" "}
            <span className="text-text">Add to Home Screen</span>. On desktop Chrome or Edge,
            look for the install icon in the address bar.
          </p>
        </div>
      )}

      {status && <p className="text-[10px] text-text-subtle mt-2 m-0">{status}</p>}
    </Card>
  );
}
