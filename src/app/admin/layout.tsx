import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { adminNav } from "@/lib/nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell nav={adminNav} badge="Admin">
        {children}
      </AppShell>
    </AuthGate>
  );
}
