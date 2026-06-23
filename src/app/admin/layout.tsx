import { AppShell } from "@/components/AppShell";
import { adminNav } from "@/lib/nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell nav={adminNav} badge="Admin">
      {children}
    </AppShell>
  );
}
