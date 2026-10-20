import { InvestorShell } from "@/components/InvestorShell";
import { AuthGate } from "@/components/AuthGate";
import { EventPopup } from "@/components/events/EventPopup";
import { PromoPopup } from "@/components/promos/PromoPopup";
import { ChatFab } from "@/components/ChatFab";
import { WelcomePopup } from "@/components/WelcomePopup";
import { UnreadProvider } from "@/components/UnreadProvider";
import { PushAutoRegister } from "@/components/PushAutoRegister";

export default function InvestorAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      {/* Unread counts for the menu badges, the tab title and the installed app's icon. */}
      <UnreadProvider>
        <InvestorShell>{children}</InvestorShell>
        {/* First sign-in greeting from the admin team — shown once, above everything else. */}
        <WelcomePopup />
        {/* Limited-event announcement after sign-in (skips itself inside the games). */}
        <EventPopup />
        {/* Promotional pop-ups (how-to video, announcements). Sits just under the event pop-up. */}
        <PromoPopup />
        {/* Floating chat shortcut with an unread badge (draggable; hides while scrolling). */}
        <ChatFab />
        {/* Push: registers an allowed device by itself; otherwise asks on the first tap. */}
        <PushAutoRegister />
      </UnreadProvider>
    </AuthGate>
  );
}
