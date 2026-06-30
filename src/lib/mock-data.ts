// Mock data for prototype. Replace with Firebase/CoinGecko calls later.

export type CoinTicker = {
  symbol: string;
  price: number;
  change24h: number;
};

export const mockTickers: CoinTicker[] = [
  { symbol: "BTC", price: 98420, change24h: 1.84 },
  { symbol: "ETH", price: 3412, change24h: 0.92 },
  { symbol: "SOL", price: 184.21, change24h: -0.42 },
  { symbol: "BNB", price: 684.5, change24h: 0.31 },
  { symbol: "XRP", price: 2.41, change24h: 2.18 },
  { symbol: "ADA", price: 0.94, change24h: -0.78 },
  { symbol: "DOGE", price: 0.38, change24h: 1.12 },
  { symbol: "AVAX", price: 38.4, change24h: 0.85 },
  { symbol: "DOT", price: 7.92, change24h: -0.34 },
  { symbol: "LINK", price: 18.6, change24h: 1.42 },
  { symbol: "MATIC", price: 0.62, change24h: 2.05 },
  { symbol: "LTC", price: 96.4, change24h: -1.12 },
  { symbol: "UNI", price: 12.8, change24h: 0.94 },
  { symbol: "ATOM", price: 8.45, change24h: -0.22 },
  { symbol: "NEAR", price: 5.18, change24h: 1.66 },
];

export type Plan = {
  id: string;
  name: string;
  durationDays: number;
  dailyRate: number; // percent, e.g. 3.5
  minInvestment: number;
  maxInvestment: number;
  featured?: boolean;
};

export const mockPlans: Plan[] = [
  {
    id: "starter-5",
    name: "5-day starter",
    durationDays: 5,
    dailyRate: 2.0,
    minInvestment: 500,
    maxInvestment: 2000,
  },
  {
    id: "growth-10",
    name: "10-day growth",
    durationDays: 10,
    dailyRate: 2.5,
    minInvestment: 1000,
    maxInvestment: 5000,
  },
  {
    id: "momentum-15",
    name: "15-day momentum",
    durationDays: 15,
    dailyRate: 3.0,
    minInvestment: 3000,
    maxInvestment: 25000,
    featured: true,
  },
  {
    id: "premium-30",
    name: "30-day premium",
    durationDays: 30,
    dailyRate: 3.5,
    minInvestment: 5000,
    maxInvestment: 100000,
  },
];

export type ActivePlan = {
  planId: string;
  capital: number;
  startedAt: Date;
  dayProgress: number; // current day in plan, 1-based
};

export const mockActivePlans: ActivePlan[] = [
  {
    planId: "growth-10",
    capital: 1000,
    startedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    dayProgress: 4,
  },
  {
    planId: "starter-5",
    capital: 500,
    startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    dayProgress: 3,
  },
  {
    planId: "premium-30",
    capital: 5000,
    startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    dayProgress: 2,
  },
];

export const mockUser = {
  name: "Genesis Devilla",
  initials: "GD",
  email: "gmdevilla001@gmail.com",
};

export const mockBalances = {
  wallet: 250,
  vault: 9445.42,
  vaultLockDay: 4, // current day in 365-day lock
  vaultLockTotal: 365,
};

// Compounding math helpers
export const VAULT_DAILY_RATE = 0.01; // 1% daily
export const VAULT_365_MULTIPLIER = Math.pow(1 + VAULT_DAILY_RATE, 365); // ≈ 37.7834

export function calcVaultCredit(capital: number, dailyRate: number, days: number) {
  return capital * (dailyRate / 100) * days;
}

export function calcVaultAfterDays(vaultCredit: number, days: number) {
  return vaultCredit * Math.pow(1 + VAULT_DAILY_RATE, days);
}

export function calcVaultAfter365(vaultCredit: number) {
  return vaultCredit * VAULT_365_MULTIPLIER;
}

// Reinvestment scenario: ₱X added every 30 days for `months` months,
// vault compounds 1% daily on running balance.
// First deposit lands at day 0.
export function calcReinvestmentVault(monthlyDeposit: number, months: number, measureDay: number) {
  let balance = 0;
  for (let day = 0; day <= measureDay; day++) {
    if (day % 30 === 0 && day / 30 < months) {
      balance += monthlyDeposit;
    }
    if (day > 0) {
      balance *= 1 + VAULT_DAILY_RATE;
    }
  }
  return balance;
}

// Activity events for feed
export type ActivityType = "payout" | "compound" | "plan-activate" | "plan-complete" | "withdrawal" | "reinvest" | "deposit";

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  amount?: number;
  amountKind?: "in" | "out" | "neutral";
  at: Date;
};

const now = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const mockActivity: ActivityEvent[] = [
  {
    id: "a1",
    type: "payout",
    title: "Daily payout received",
    subtitle: "3 active plans · 00:01",
    amount: 185,
    amountKind: "in",
    at: new Date(now - 6 * HOUR),
  },
  {
    id: "a2",
    type: "compound",
    title: "Vault compounded",
    subtitle: "1.0% daily on ₱9,351",
    amount: 94.45,
    amountKind: "in",
    at: new Date(now - 6 * HOUR - 60 * 1000),
  },
  {
    id: "a3",
    type: "plan-activate",
    title: "Plan activated — 30-day premium",
    subtitle: "Yesterday 14:23",
    amount: 5000,
    amountKind: "out",
    at: new Date(now - DAY),
  },
  {
    id: "a4",
    type: "plan-complete",
    title: "Plan completed — 5-day basic",
    subtitle: "Credited to vault",
    amount: 100,
    amountKind: "neutral",
    at: new Date(now - 3 * DAY),
  },
  {
    id: "a5",
    type: "withdrawal",
    title: "Withdrawal approved",
    subtitle: "To bank ····3421",
    amount: 500,
    amountKind: "out",
    at: new Date(now - 7 * DAY),
  },
];

// Plan history (completed + active rolled together for the table)
export type PlanHistoryRow = {
  id: string;
  name: string;
  capital: number;
  earned: number;
  vaultCredit: number | null;
  status: "active" | "done";
  completedAt?: Date;
};

export const mockPlanHistory: PlanHistoryRow[] = [
  {
    id: "h1",
    name: "5-day starter",
    capital: 500,
    earned: 50,
    vaultCredit: 50,
    status: "done",
    completedAt: new Date(now - 100 * DAY),
  },
  {
    id: "h2",
    name: "10-day boost",
    capital: 2000,
    earned: 500,
    vaultCredit: 500,
    status: "done",
    completedAt: new Date(now - 90 * DAY),
  },
  {
    id: "h3",
    name: "15-day momentum",
    capital: 3000,
    earned: 1350,
    vaultCredit: 1350,
    status: "done",
    completedAt: new Date(now - 76 * DAY),
  },
  {
    id: "h4",
    name: "10-day growth",
    capital: 1000,
    earned: 100,
    vaultCredit: null,
    status: "active",
  },
];

// Derived helpers
export function getTotalDailyIncome() {
  return mockActivePlans.reduce((sum, ap) => {
    const plan = mockPlans.find((p) => p.id === ap.planId);
    if (!plan) return sum;
    return sum + ap.capital * (plan.dailyRate / 100);
  }, 0);
}

export function getTotalDeployed() {
  return mockActivePlans.reduce((sum, ap) => sum + ap.capital, 0);
}

export function getPendingVaultCredits() {
  return mockActivePlans.reduce((sum, ap) => {
    const plan = mockPlans.find((p) => p.id === ap.planId);
    if (!plan) return sum;
    return sum + ap.capital * (plan.dailyRate / 100) * plan.durationDays;
  }, 0);
}
