"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { idleAction } from "@/lib/tongits-game";

export function TongitsIdleOverlay({ code }: { code: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function onJoin() {
    setBusy("join");
    try {
      await idleAction(code, "join_next");
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }

  async function onQuit() {
    setBusy("quit");
    try {
      await idleAction(code, "quit");
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "3%",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        background: "linear-gradient(135deg, rgba(10,28,48,0.95), rgba(14,40,72,0.95))",
        border: "1px solid rgba(245,198,107,0.4)",
        borderRadius: "12px",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <span
        style={{
          color: "rgba(255,255,255,0.8)",
          fontSize: "13px",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        You&apos;re spectating
      </span>

      <button
        onClick={onJoin}
        disabled={!!busy}
        style={{
          background: "linear-gradient(135deg, #4bd47a, #2ea655)",
          border: "none",
          borderRadius: "8px",
          padding: "8px 14px",
          color: "#fff",
          fontWeight: 700,
          fontSize: "12px",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          whiteSpace: "nowrap",
        }}
      >
        {busy === "join" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Join Next Round
      </button>

      <button
        onClick={onQuit}
        disabled={!!busy}
        style={{
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: "8px",
          padding: "8px 14px",
          color: "#ef4444",
          fontWeight: 700,
          fontSize: "12px",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          whiteSpace: "nowrap",
        }}
      >
        {busy === "quit" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Quit Room
      </button>
    </div>
  );
}
