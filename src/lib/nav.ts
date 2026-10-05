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
  | "help"
  | "megaphone";

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
      { label: "Pop-up ads", href: "/admin/promos", icon: "megaphone" },
      { label: "Withdrawals", href: "/admin/withdrawals", icon: "withdraw" },
      { label: "Referrals", href: "/admin/referrals", icon: "share" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Active placements", href: "/admin/placements", icon: "timer" },
      { label: "Transactions", href: "/admin/transactions", icon: "receipt" },
      { label: "Reinvestments", href: "/admin/reinvestments", icon: "refresh" },
      { label: "Community chat", href: "/admin/community", icon: "chat" },
      { label: "Member menu", href: "/admin/menu", icon: "dashboard" },
    ],
  },
  {
    label: "Games",
    items: [
      { label: "Game Settings", href: "/admin/games", icon: "fish" },
      { label: "Tongits", href: "/admin/tongits", icon: "spade" },
      { label: "Rewards & redemptions", href: "/admin/rewards", icon: "gift" },
      { label: "Color Game", href: "/admin/color-game", icon: "play" },
      { label: "Rankings", href: "/admin/rankings", icon: "chart" },
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

// ===== Admin-arranged member menu =====

/**
 * How the admin arranged the member menu: for each of the menu's groups, the
 * pages in order (by address), plus pages hidden from the menu. Stored in
 * `settings/platform.menu`. Hiding only removes the icon — the page itself
 * still opens from a link.
 */
export type MenuLayout = { groups: string[][]; hidden: string[] };

/** Pages that can never be hidden: the home screen, and Profile (sign-out lives there). */
export const MENU_LOCKED = ["/dashboard", "/profile"];

/** Names for the three groups, as the phone menu titles them. */
export const MENU_GROUP_NAMES = ["Finance", "Community Games", "Account"];

/**
 * Apply the admin's arrangement to the built-in menu. Anything the arrangement
 * doesn't mention (a page added to the app later) stays in its built-in group,
 * at the end — so a new feature can never silently go missing from the menu.
 */
export function applyMenuLayout(base: NavGroup[], layout?: Partial<MenuLayout> | null): NavGroup[] {
  const groups = Array.isArray(layout?.groups) ? layout!.groups : [];
  const hidden = new Set((Array.isArray(layout?.hidden) ? layout!.hidden : []).filter((h) => !MENU_LOCKED.includes(h)));
  if (groups.length === 0 && hidden.size === 0) return base;

  const byHref = new Map<string, NavItem>();
  for (const g of base) for (const it of g.items) byHref.set(it.href, it);
  const placed = new Set<string>();
  const out: NavGroup[] = base.map((g, gi) => {
    const items: NavItem[] = [];
    for (const href of Array.isArray(groups[gi]) ? groups[gi] : []) {
      const it = byHref.get(href);
      if (!it || placed.has(href)) continue;
      placed.add(href);
      if (!hidden.has(href)) items.push(it);
    }
    return { label: g.label, items };
  });
  // not mentioned anywhere → keep in the built-in group
  base.forEach((g, gi) => {
    for (const it of g.items) {
      if (placed.has(it.href)) continue;
      placed.add(it.href);
      if (!hidden.has(it.href)) out[gi].items.push(it);
    }
  });
  return out;
}

/** The arrangement currently in effect, written out in full (for the admin editor). */
export function currentMenuLayout(base: NavGroup[], layout?: Partial<MenuLayout> | null): MenuLayout {
  const hidden = (Array.isArray(layout?.hidden) ? layout!.hidden : []).filter((h) => !MENU_LOCKED.includes(h));
  const groups = Array.isArray(layout?.groups) ? layout!.groups : [];
  const known = new Set(base.flatMap((g) => g.items.map((i) => i.href)));
  const placed = new Set<string>();
  const out = base.map((_, gi) => {
    const list: string[] = [];
    for (const href of Array.isArray(groups[gi]) ? groups[gi] : []) if (known.has(href) && !placed.has(href)) { placed.add(href); list.push(href); }
    return list;
  });
  base.forEach((g, gi) => { for (const it of g.items) if (!placed.has(it.href)) { placed.add(it.href); out[gi].push(it.href); } });
  return { groups: out, hidden: hidden.filter((h) => known.has(h)) };
}

/**
 * The arrangement as it is saved. Firestore cannot store a list of lists, so
 * each group is wrapped in an object: `{ groups: [{ items: [...] }, ...], hidden: [...] }`.
 */
export type StoredMenu = { groups?: { items?: string[] }[]; hidden?: string[] };

export function menuFromStored(stored?: StoredMenu | null): MenuLayout | null {
  if (!stored || typeof stored !== "object") return null;
  const groups = Array.isArray(stored.groups) ? stored.groups.map((g) => (g && Array.isArray(g.items) ? g.items.filter((h) => typeof h === "string") : [])) : [];
  const hidden = Array.isArray(stored.hidden) ? stored.hidden.filter((h) => typeof h === "string") : [];
  return groups.length === 0 && hidden.length === 0 ? null : { groups, hidden };
}

export function menuToStored(layout: MenuLayout): StoredMenu {
  return { groups: layout.groups.map((items) => ({ items })), hidden: layout.hidden };
}
