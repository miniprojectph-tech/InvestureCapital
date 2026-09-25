export type IconName =
  | "dashboard"
  | "coins"
  | "wallet"
  | "lock"
  | "activity"
  | "withdraw"
  | "receipt"
  | "user"
  | "support"
  | "users"
  | "chart"
  | "settings"
  | "timer"
  | "bot"
  | "play"
  | "gift"
  | "fish"
  | "share"
  | "spade"
  | "refresh"
  | "chat"
  | "help";

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  badge?: number;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const investorNav: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "My plans", href: "/plans", icon: "coins" },
      { label: "Wallet", href: "/wallet", icon: "wallet" },
      { label: "Bonuses", href: "/bonuses", icon: "lock" },
      { label: "AI Trading", href: "/ai-trading", icon: "bot" },
      { label: "Referrals", href: "/referrals", icon: "share" },
      { label: "Withdrawals", href: "/withdrawals", icon: "withdraw" },
      { label: "Transactions", href: "/transactions", icon: "receipt" },
    ],
  },
  {
    label: "Community Games",
    items: [
      { label: "Games", href: "/games", icon: "play" },
      { label: "Rewards", href: "/rewards", icon: "gift" },
    ],
  },
  {
    items: [
      { label: "Community", href: "/community", icon: "chat" },
      { label: "Profile", href: "/profile", icon: "user" },
      { label: "Help & FAQ", href: "/faq", icon: "help" },
      { label: "Support", href: "/support", icon: "support" },
    ],
  },
];

export const adminNav: NavGroup[] = [
  {
    label: "Admin",
    items: [
      { label: "Dashboard", href: "/admin", icon: "dashboard" },
      { label: "Investors", href: "/admin/investors", icon: "users" },
      { label: "Compensation plan", href: "/admin/comp-plan", icon: "coins" },
      { label: "Placement requests", href: "/admin/plan-requests", icon: "coins" },
      { label: "Events", href: "/admin/events", icon: "gift" },
      { label: "Withdrawals", href: "/admin/withdrawals", icon: "withdraw" },
      { label: "Referrals", href: "/admin/referrals", icon: "share" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Active placements", href: "/admin/placements", icon: "timer" },
      { label: "Transactions", href: "/admin/transactions", icon: "receipt" },
      { label: "Activity log", href: "/admin/activity", icon: "activity" },
      { label: "Reinvestments", href: "/admin/reinvestments", icon: "refresh" },
      { label: "Community chat", href: "/admin/community", icon: "chat" },
    ],
  },
  {
    label: "Games",
    items: [
      { label: "Game Settings", href: "/admin/games", icon: "fish" },
      { label: "Tongits", href: "/admin/tongits", icon: "spade" },
      { label: "Rewards & redemptions", href: "/admin/rewards", icon: "gift" },
      { label: "Color Game", href: "/admin/color-game", icon: "play" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Reports", href: "/admin/reports", icon: "chart" },
      { label: "FAQ", href: "/admin/faq", icon: "help" },
      { label: "Settings", href: "/admin/settings", icon: "settings" },
    ],
  },
];
