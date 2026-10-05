"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { investorNav, applyMenuLayout, menuFromStored } from "@/lib/nav";
import { useSettings } from "@/lib/settings";

/** The member app frame, with the menu in the order the admin arranged it. */
export function InvestorShell({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const nav = useMemo(() => applyMenuLayout(investorNav, menuFromStored(settings.menu)), [settings.menu]);
  return <AppShell nav={nav}>{children}</AppShell>;
}
