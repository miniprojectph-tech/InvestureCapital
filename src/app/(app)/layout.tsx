import { InvestorShell } from "@/components/InvestorShell";
import { AuthGate } from "@/components/AuthGate";
import { EventPopup } from "@/components/events/EventPopup";
import { PromoPopup } from "@/components/promos/PromoPopup";
import { ChatFab } from "@/components/ChatFab";

export default function InvestorAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <InvestorShell>{children}</InvestorShell>
      {/* Limited-event announcement after sign-in (skips itself inside the games). */}
      <EventPopup />
      {/* Promotional pop-ups (how-to video, announcements). Sits just under the event pop-up. */}
      <PromoPopup />
      {/* Floating chat shortcut with a "new messages" badge (draggable; hides while scrolling). */}
      <ChatFab />
    </AuthGate>
  );
}
