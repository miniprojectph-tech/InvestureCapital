"use client";

import { Bell } from "lucide-react";
import { mockUser } from "@/lib/mock-data";

type TopHeaderProps = {
  title: string;
  subtitle?: string;
};

export function TopHeader({ title, subtitle }: TopHeaderProps) {
  return (
    <div className="flex justify-between items-center pb-3 mb-4 border-b border-border">
      <div>
        <p className="text-[14px] font-medium text-text m-0">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-text-muted mt-0.5 m-0">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="relative" aria-label="Notifications">
          <Bell className="w-4 h-4 text-text-muted" strokeWidth={2} />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red rounded-full text-[8px] text-white flex items-center justify-center font-medium">
            3
          </span>
        </button>
        <div className="w-6 h-6 rounded-full bg-blue/15 text-blue text-[10px] font-medium flex items-center justify-center">
          {mockUser.initials}
        </div>
      </div>
    </div>
  );
}
