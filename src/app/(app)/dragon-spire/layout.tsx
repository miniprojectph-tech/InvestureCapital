"use client";

import type { ReactNode } from "react";
import { GameAccessGate } from "@/components/GameAccessGate";

/** Dragon Spire plays portrait, full screen (the app shell steps aside for it, like Color Game). */
export default function DragonSpireLayout({ children }: { children: ReactNode }) {
  return <GameAccessGate>{children}</GameAccessGate>;
}
