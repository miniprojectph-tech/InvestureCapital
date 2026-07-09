"use client";

import type { ReactNode } from "react";
import { useIsPortraitMobile } from "@/lib/tongits-social";

/** Whole-section landscape gate: any /tongits/* route in portrait shows the rotate prompt. */
export default function TongitsSectionLayout({ children }: { children: ReactNode }) {
  const portraitMobile = useIsPortraitMobile();
  if (portraitMobile) return <RotateDevicePrompt />;
  return <>{children}</>;
}

function RotateDevicePrompt() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1730] text-white p-8">
      <div className="max-w-[280px] text-center flex flex-col items-center gap-5">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div
            className="w-16 h-24 rounded-lg border-[3px] border-gold"
            style={{
              animation: "tongitsRotateHint 2.4s ease-in-out infinite",
              transformOrigin: "center",
            }}
          />
          <style>{`
            @keyframes tongitsRotateHint {
              0%, 20% { transform: rotate(0deg); }
              50%, 80% { transform: rotate(-90deg); }
              100% { transform: rotate(0deg); }
            }
          `}</style>
        </div>
        <div>
          <p className="font-bold text-[18px] mb-2 text-gold">Rotate your device</p>
          <p className="text-[13px] text-white/70 leading-relaxed">
            Tongits plays best in landscape. Turn your phone sideways to open the table.
          </p>
        </div>
      </div>
    </div>
  );
}
