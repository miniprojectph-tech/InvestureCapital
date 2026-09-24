"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowDownRight, Lock, Loader2, ArrowUpRight, Clock } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { EventBanner } from "@/components/events/EventBanner";
import { Card } from "@/components/Card";
import { StatStrip } from "@/components/StatStrip";
import { PortfolioDonut } from "@/components/PortfolioDonut";
import { DashGrowthArea } from "@/components/DashGrowthArea";
import { ActivePlansList } from "@/components/ActivePlansList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PlanHistoryTable } from "@/components/PlanHistoryTable";
import { formatPHP } from "@/lib/utils";
import { useUserState } from "@/lib/useUserState";
import {
  useNow,
  placedCapital,
  dailyAccrualTotal,
  upcomingBonuses,
  totalEarned,
  nextPayout,
  projectedPayouts,
  formatCountdown,
  peso,
} from "@/lib/compplan";

const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function DashboardPage() {
  const { state, loading } = useUserState();
  const now = useNow(30_000);

  if (loading || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-gold animate-spin" />
        <p className="text-[11px] text-text-subtle m-0">Loading your portfolio…</p>
      </div>
    );
  }

  const placements = state.placements ?? [];
  const completed = state.completedPlacements ?? [];
  const wallet = state.balances.wallet;
  const placed = placedCapital(placements);
  const accrual = dailyAccrualTotal(placements);
  const bonuses = upcomingBonuses(placements);
  const earned = totalEarned(placements, completed);
  const total = wallet + placed;
  const next = nextPayout(placements, now);

  const everPlaced = placed + completed.reduce((s, p) => s + p.capital, 0);
  const roi = everPlaced > 0 ? (earned / everPlaced) * 100 : 0;

  const firstName = state.profile.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Real projection: wallet + placed capital, plus every scheduled payout in the next 30 days.
  const scheduled = projectedPayouts(placements, 30, now);
  const growthData = scheduled.map((v, day) => ({ day, value: total + v }));

  return (
    <div>
      <TopHeader
        title={`${greeting}, ${firstName}`}
        subtitle={
          placements.length === 0
            ? "No active placements yet"
            : `${placements.length} active placement${placements.length > 1 ? "s" : ""} · next payout ${next ? `${peso(next.amount)} in ${formatCountdown(next.msLeft)}` : "—"}`
        }
      />

      <motion.div variants={stagger} initial="hidden" animate="show">
        <EventBanner className="mb-3" />
        <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-3">
          <Card className="!p-0">
            <StatStrip
              stats={[
                { label: "Total portfolio", caption: `${placements.length} placements`, value: formatPHP(total, { short: true }), trend: { delta: roi, suffix: "%" }, emphasis: true },
                { label: "Capital placed", value: formatPHP(placed, { short: true }) },
                { label: "Total earned", value: formatPHP(earned, { short: true }) },
                { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` },
              ]}
            />

            <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4 px-4 pb-4 pt-2 border-t border-border">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-medium m-0">Next 30 days</p>
                  <span className="text-[10px] text-text-subtle">wallet + capital + scheduled payouts</span>
                </div>
                <div className="h-[150px]">
                  <DashGrowthArea data={growthData} />
                </div>
              </div>

              <div className="md:border-l md:border-border md:pl-4">
                <p className="text-[12px] font-medium m-0 mb-3">Your portfolio</p>
                <PortfolioDonut
                  slices={[
                    { name: "Wallet", value: wallet, color: "#4F8EF7" },
                    { name: "Placed", value: placed, color: "#3DD598" },
                    { name: "Bonuses due", value: bonuses, color: "#A78BFA" },
                  ]}
                />
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-3">
            {/* 5 Days Income */}
            <Link href="/wallet" className="block">
              <Card hoverable className="h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-green/15 flex items-center justify-center ring-1 ring-green/15">
                    <ArrowDownRight className="w-4 h-4 text-green" />
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-text-subtle" />
                </div>
                <p className="text-[12px] font-medium m-0">5 Days Income</p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5">{placements.length} active placement{placements.length === 1 ? "" : "s"}</p>
                <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0 mt-4">Wallet balance</p>
                <p className="text-[22px] font-mono font-medium m-0 tabular-nums">{formatPHP(wallet, { short: true })}</p>
                <div className="flex items-center justify-between mt-2 text-[10px]">
                  <span className="text-green font-mono">+{peso(accrual)} accruing today</span>
                  {next && (
                    <span className="text-text-subtle flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {formatCountdown(next.msLeft)}
                    </span>
                  )}
                </div>
              </Card>
            </Link>

            {/* Locked-In Bonuses */}
            <Link href="/plans" className="block">
              <Card hoverable className="h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-vault/15 flex items-center justify-center ring-1 ring-vault/20">
                    <Lock className="w-4 h-4 text-vault" />
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-text-subtle" />
                </div>
                <p className="text-[12px] font-medium m-0">Locked-In Bonuses</p>
                <p className="text-[10px] text-text-subtle m-0 mt-0.5">Paid with each final payout</p>
                <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0 mt-4">Bonuses due</p>
                <p className="text-[22px] font-mono font-medium m-0 tabular-nums text-vault">{formatPHP(bonuses, { short: true })}</p>
                <p className="text-[10px] text-text-subtle m-0 mt-2">
                  {placements.filter((p) => p.lockedBonus > 0).length} placement{placements.filter((p) => p.lockedBonus > 0).length === 1 ? "" : "s"} with a bonus
                  {completed.length > 0 && ` · ${formatPHP(completed.reduce((s, p) => s + p.lockedBonusPaid, 0), { short: true })} paid so far`}
                </p>
              </Card>
            </Link>
          </div>
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ActivePlansList />
          <ActivityFeed />
          <PlanHistoryTable />
        </motion.div>
      </motion.div>
    </div>
  );
}
