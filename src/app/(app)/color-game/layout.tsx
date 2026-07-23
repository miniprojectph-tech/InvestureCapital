"use client";

import { useEffect, type ReactNode } from "react";
import { useIsPortraitMobile } from "@/lib/tongits-social";
import { GameAccessGate } from "@/components/GameAccessGate";

export default function ColorGameLayout({ children }: { children: ReactNode }) {
  const portraitMobile = useIsPortraitMobile();
  if (portraitMobile) return <RotateDevicePrompt />;
  return <GameAccessGate>{children}</GameAccessGate>;
}

async function enterImmersive() {
  try {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen();
    const orient = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    await orient?.lock?.("landscape");
  } catch {
    /* iOS / unsupported */
  }
}

function RotateDevicePrompt() {
  useEffect(() => {
    const go = () => void enterImmersive();
    window.addEventListener("pointerdown", go, { once: true });
    return () => window.removeEventListener("pointerdown", go);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a0a2e] text-white p-8">
      <div className="max-w-[280px] text-center flex flex-col items-center gap-5">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div
            className="w-16 h-24 rounded-lg border-[3px] border-[#FF6B9D]"
            style={{
              animation: "colorRotateHint 2.4s ease-in-out infinite",
              transformOrigin: "center",
            }}
          />
          <style>{`
            @keyframes colorRotateHint {
              0%, 20% { transform: rotate(0deg); }
              50%, 80% { transform: rotate(-90deg); }
              100% { transform: rotate(0deg); }
            }
          `}</style>
        </div>
        <div>
          <p className="font-bold text-[18px] mb-2 text-[#FF6B9D]">Rotate your device</p>
          <p className="text-[13px] text-white/70 leading-relaxed">
            Color Game plays best in landscape. Tap below or turn your phone sideways.
          </p>
        </div>
        <button
          onClick={() => void enterImmersive()}
          className="mt-1 px-5 py-2 rounded-lg bg-[#FF6B9D] text-white text-[13px] font-semibold hover:brightness-110 transition"
        >
          Go full-screen
        </button>
      </div>
    </div>
  );
}
