"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, User as UserIcon, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mockUser } from "@/lib/mock-data";

type TopHeaderProps = {
  title: string;
  subtitle?: string;
};

export function TopHeader({ title, subtitle }: TopHeaderProps) {
  const { user, demoMode, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Use real auth user if available; fall back to mock for demo mode
  const displayUser = user ?? mockUser;
  const initials = "initials" in displayUser ? displayUser.initials : "U";
  const name = displayUser.name;
  const email = "email" in displayUser ? displayUser.email : "";

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    router.push("/login");
  }

  return (
    <div className="flex justify-between items-center pb-3 mb-4 border-b border-border">
      <div>
        <p className="text-[14px] font-medium text-text m-0">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-text-muted mt-0.5 m-0">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {demoMode && (
          <span className="text-[9px] font-medium bg-blue/15 text-blue px-2 py-0.5 rounded-full">
            Demo
          </span>
        )}
        <button className="relative" aria-label="Notifications">
          <Bell className="w-4 h-4 text-text-muted" strokeWidth={2} />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red rounded-full text-[8px] text-white flex items-center justify-center font-medium">
            3
          </span>
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 hover:opacity-80 transition"
            aria-label="Account menu"
          >
            <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[10px] font-medium flex items-center justify-center">
              {initials}
            </div>
            <ChevronDown className="w-3 h-3 text-text-subtle" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg p-1 min-w-[180px] shadow-lg z-30">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[12px] font-medium m-0 truncate">{name}</p>
                {email && (
                  <p className="text-[10px] text-text-subtle mt-0.5 m-0 truncate">{email}</p>
                )}
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[12px] text-text hover:bg-card-elev rounded-md"
              >
                <UserIcon className="w-3.5 h-3.5" /> Profile
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red hover:bg-red/10 rounded-md"
              >
                <LogOut className="w-3.5 h-3.5" /> {demoMode ? "Back to login" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
