import { AppShell } from "@/components/AppShell";
import { AdminGate } from "@/components/AdminGate";
import { adminNav } from "@/lib/nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <AppShell nav={adminNav} badge="Admin">
        {children}
      </AppShell>
    </AdminGate>
  );
}
