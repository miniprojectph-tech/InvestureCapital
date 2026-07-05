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
  | "share";

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
      { label: "Vault", href: "/vault", icon: "lock" },
      { label: "AI Trading", href: "/ai-trading", icon: "bot" },
      { label: "Referrals", href: "/referrals", icon: "share" },
      { label: "Activity", href: "/activity", icon: "activity" },
      { label: "Withdrawals", href: "/withdrawals", icon: "withdraw" },
      { label: "Transactions", href: "/transactions", icon: "receipt" },
    ],
  },
  {
    label: "Reef",
    items: [
      { label: "Play", href: "/play", icon: "play" },
      { label: "Rewards", href: "/rewards", icon: "gift" },
    ],
  },
  {
    items: [
      { label: "Profile", href: "/profile", icon: "user" },
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
      { label: "Plans", href: "/admin/plans", icon: "coins" },
      { label: "Top-up requests", href: "/admin/topups", icon: "wallet" },
      { label: "Withdrawals", href: "/admin/withdrawals", icon: "withdraw" },
      { label: "Referrals", href: "/admin/referrals", icon: "share" },
      { label: "Vault accounts", href: "/admin/vault", icon: "lock" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Active plans", href: "/admin/active-plans", icon: "timer" },
      { label: "Active vaults", href: "/admin/active-vaults", icon: "lock" },
      { label: "Transactions", href: "/admin/transactions", icon: "receipt" },
      { label: "Activity log", href: "/admin/activity", icon: "activity" },
    ],
  },
  {
    label: "Games",
    items: [
      { label: "Game Settings", href: "/admin/games", icon: "fish" },
      { label: "Rewards & redemptions", href: "/admin/rewards", icon: "gift" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Reports", href: "/admin/reports", icon: "chart" },
      { label: "Settings", href: "/admin/settings", icon: "settings" },
    ],
  },
];
