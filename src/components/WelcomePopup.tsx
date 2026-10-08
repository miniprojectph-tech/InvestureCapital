"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, PartyPopper } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useUserState } from "@/lib/useUserState";
import { useSettings, DEFAULT_WELCOME_TEXT, fillWelcome } from "@/lib/settings";

/**
 * The one-time welcome a new member sees on their first sign-in. The server
 * marks the record (`welcomeSentAt`) when it places the welcome message in
 * their private chat; this shows until the member closes it (`welcomeSeenAt`).
 * Sits above the event and promo pop-ups so the greeting comes first.
 */
export function WelcomePopup() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, demoMode } = useAuth();
  const { state } = useUserState();
  const { settings } = useSettings();
  const [closing, setClosing] = useState(false);

  const inGame = pathname.startsWith("/tongits") || pathname.startsWith("/color-game") || pathname.startsWith("/play");
  const due = !!user && !demoMode && !inGame && !!state?.welcomeSentAt && !state.welcomeSeenAt && !closing;
  const first = (state?.profile?.name ?? user?.name ?? "").trim().split(/\s+/)[0] || "there";
  const text = fillWelcome(settings.welcome?.text || DEFAULT_WELCOME_TEXT, first);

  async function dismiss(toChat: boolean) {
    setClosing(true);
    const { db } = getFirebase();
    if (db && user) {
      // Remembered on the account, so it doesn't come back on another device.
      await updateDoc(doc(db, "users", user.uid), { welcomeSeenAt: Date.now() }).catch(() => {});
    }
    if (toChat) router.push("/community#admin");
  }

  return (
    <AnimatePresence>
      {due && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[62] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-sm rounded-3xl bg-card border border-green/40 shadow-2xl overflow-hidden"
          >
            <div className="h-24 flex items-center justify-center" style={{ background: "radial-gradient(120% 90% at 30% 10%, #3DD59855, transparent 60%), radial-gradient(90% 90% at 90% 90%, #4F8EF755, transparent 60%), #0E1A2C" }}>
              <PartyPopper className="w-10 h-10 text-green" />
            </div>
            <div className="px-5 pb-5 pt-4 flex flex-col gap-3">
              <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0">A message from the admin team</p>
              <div className="text-[13px] leading-relaxed text-text whitespace-pre-line">{text}</div>
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="w-full py-3 rounded-xl text-[13px] font-bold bg-gold text-gold-dark hover:brightness-110 transition flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Message the admin
              </button>
              <button type="button" onClick={() => dismiss(false)} className="self-center text-[11px] text-text-muted hover:text-text px-2 py-1">
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
