"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Coins,
  Wallet,
  Lock,
  Activity,
  ArrowDownRight,
  Receipt,
  User,
  LifeBuoy,
  Users,
  ChartBar,
  Settings,
  Timer,
  Bot,
  Gamepad2,
  Gift,
  Fish,
  Share2,
  Spade,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import type { NavGroup, IconName } from "@/lib/nav";
import { cn } from "@/lib/utils";

const iconMap: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  coins: Coins,
  wallet: Wallet,
  lock: Lock,
  activity: Activity,
  withdraw: ArrowDownRight,
  receipt: Receipt,
  user: User,
  support: LifeBuoy,
  users: Users,
  chart: ChartBar,
  settings: Settings,
  timer: Timer,
  bot: Bot,
  play: Gamepad2,
  gift: Gift,
  fish: Fish,
  share: Share2,
  spade: Spade,
  refresh: RefreshCw,
};

const PETALS = Array.from({ length: 8 }, (_, i) => i);

function sectionTitle(group: NavGroup, index: number): string {
  if (group.label) return group.label;
  return index === 0 ? "Finance" : "Account";
}

export function MobileLauncher({ nav, badge }: { nav: NavGroup[]; badge?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close whenever the route changes (tile tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll + Escape-to-close while open.
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = orig;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* ===== Full-screen launcher ===== */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-canvas/95 backdrop-blur-xl"
          >
            {/* Top bar */}
            <div className="sticky top-0 z-10 flex items-center justify-end px-4 pt-4 pb-2">
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="p-2 -mr-2 text-text-muted hover:text-text active:scale-90 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="px-4 pb-40 flex flex-col gap-4"
            >
              {nav.map((group, gi) => (
                <section
                  key={gi}
                  className="bg-card border border-border rounded-2xl px-5 pt-5 pb-6"
                >
                  <h2
                    className="text-text m-0 mb-4 pb-3 border-b border-border"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "22px",
                      fontVariationSettings: '"opsz" 40',
                    }}
                  >
                    {sectionTitle(group, gi)}
                  </h2>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-5">
                    {group.items.map((item) => {
                      const Icon = iconMap[item.icon];
                      const active =
                        pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex flex-col items-center gap-2 group"
                        >
                          <span
                            className={cn(
                              "relative w-14 h-14 rounded-full flex items-center justify-center border transition",
                              active
                                ? "bg-gold/15 border-gold/40"
                                : "bg-card-elev border-border group-active:scale-90"
                            )}
                          >
                            <Icon
                              className={cn("w-6 h-6", active ? "text-gold" : "text-text")}
                              strokeWidth={1.9}
                            />
                            {item.badge ? (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[9px] font-semibold flex items-center justify-center">
                                {item.badge}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] text-center leading-tight",
                              active ? "text-gold" : "text-text-muted"
                            )}
                          >
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}

              {badge && (
                <p className="text-center text-[11px] text-text-subtle m-0">{badge}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Floating center button (morphs open ⇄ close) ===== */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[60]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        {/* Petal bloom */}
        <AnimatePresence>
          {open && (
            <div className="absolute left-1/2 top-1/2 pointer-events-none" aria-hidden>
              {PETALS.map((i) => (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    transformOrigin: "0 0",
                    transform: `rotate(${i * 45}deg) translateY(-27px)`,
                  }}
                >
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ delay: i * 0.018, type: "spring", stiffness: 300, damping: 18 }}
                    style={{
                      display: "block",
                      width: 20,
                      height: 38,
                      marginLeft: -10,
                      marginTop: -19,
                      borderRadius: "50% 50% 45% 45% / 65% 65% 38% 38%",
                      background: "linear-gradient(180deg,#F6D680 0%,#D79A2B 55%,#B26A00 100%)",
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,.45), 0 1px 3px rgba(0,0,0,.35)",
                    }}
                  />
                </span>
              ))}
            </div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="relative w-[62px] h-[62px] rounded-full flex items-center justify-center active:scale-95 transition"
          style={{
            background: "radial-gradient(circle at 50% 35%, #232838, #12141c)",
            border: "1.5px solid rgba(230,180,74,0.55)",
            boxShadow:
              "0 6px 20px rgba(0,0,0,.5), 0 0 0 4px rgba(10,12,18,.6), 0 0 16px rgba(230,180,74,.35)",
          }}
        >
          <span
            className="text-gold font-semibold leading-none text-center"
            style={{ fontSize: open ? "11px" : "13px" }}
          >
            {open ? (
              <>
                Tap to
                <br />
                close
              </>
            ) : (
              "Menu"
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
