"use client";

import type { ReactNode } from "react";
import { GameSwitchGate } from "@/components/GameSwitchGate";

/** Investure Reef (the fishing game) can be switched off from Admin › Game Settings. */
export default function PlayLayout({ children }: { children: ReactNode }) {
  return <GameSwitchGate game="reef">{children}</GameSwitchGate>;
}
