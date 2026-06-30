"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AdminGate } from "@/components/AdminGate";
import { adminNav } from "@/lib/nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /admin/login is the entry point — it must NOT be wrapped in the gate
  // (otherwise unauthenticated users would loop infinitely on it).
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <AdminGate>
      <AppShell nav={adminNav} badge="Admin">
        {children}
      </AppShell>
    </AdminGate>
  );
}
