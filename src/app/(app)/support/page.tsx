"use client";

import { useState } from "react";
import {
  HelpCircle,
  Mail,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useCompPlan, cyclesForTerm, earningsRequiringActive, peso } from "@/lib/compplan";

export default function SupportPage() {
  const { cfg } = useCompPlan();
  const unit = cfg.increment;
  const unitPayout = (unit * cfg.cycleRate) / 100;
  const bonusTerms = cfg.terms.filter((t) => t.lockedBonusPerUnit > 0);
  const needsActive = earningsRequiringActive(cfg);
  const faqs = [
    {
      q: "How does the 5 Days Income work?",
      a: `Every ${cfg.cycleDays} days you receive ${cfg.cycleRate}% of your placement in your wallet — ${peso(unitPayout)} for every ₱${unit.toLocaleString()} placed. It accrues daily (you'll get a notice each day) and is credited as a numbered payout, e.g. "1 out of ${cyclesForTerm(cfg, cfg.terms[0].months)} payouts". The minimum term is ${cfg.terms[0].months} month${cfg.terms[0].months > 1 ? "s" : ""}.`,
    },
    {
      q: "What terms can I choose, and what is the Locked-In Bonus?",
      a: `${cfg.terms.map((t) => `${t.months} month${t.months > 1 ? "s" : ""} (${cyclesForTerm(cfg, t.months)} payouts)`).join(", ")}. ${bonusTerms.map((t) => `A ${t.months}-month term adds a Locked-In Bonus of ${peso(t.lockedBonusPerUnit)} per ₱${unit.toLocaleString()}`).join("; ")}. The bonus is paid together with your final payout.`,
    },
    {
      q: "Do I get my capital back?",
      a: "Yes. Your placement is returned in full, added to your final scheduled payout along with any Locked-In Bonus. Until then the capital stays placed; the income it generates is withdrawable at any time.",
    },
    {
      q: "How do referrals work?",
      a: `You earn on ${cfg.referralLevels.length} levels — ${cfg.referralLevels.join("% / ")}% — every time someone in your team places capital, paid instantly to your wallet. ${needsActive.length > 0 ? `To receive ${needsActive.join(" and ")} you need an active placement of at least ₱${cfg.uplineMinActive.toLocaleString()} at the moment it is paid.` : ""} Bring ${cfg.fastStartDirects} direct referrals who each place the tier minimum for a one-time Fast-Start Bonus, and earn a Leadership Bonus of ${cfg.leadershipPct}% of each direct referral's Locked-In Bonus when their term completes.`,
    },
    {
      q: "Minimum placement?",
      a: `₱${cfg.minPlacement.toLocaleString()}, in steps of ₱${unit.toLocaleString()}. Every bonus scales with the number of ₱${unit.toLocaleString()} units you place.`,
    },
    {
      q: "Is this real money?",
      a: "No. Investure Capital is a simulation platform demonstrating how a compensation plan works. All balances are illustrative. No real funds are deposited, traded, or withdrawn.",
    },
  ];
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = encodeURIComponent(
      `${message}\n\n---\nSent from Investure support page`
    );
    const subj = encodeURIComponent(subject || "Support request");
    window.location.href = `mailto:support@investure.app?subject=${subj}&body=${body}`;
  }

  return (
    <div>
      <TopHeader title="Support" subtitle="FAQs, guides, and how to reach us" />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <Card>
          <CardHeader
            title="Frequently asked"
            right={<HelpCircle className="w-4 h-4 text-text-subtle" />}
          />
          <div className="flex flex-col">
            {faqs.map((f, i) => {
              const open = openIdx === i;
              return (
                <div
                  key={i}
                  className={cn(
                    "py-2",
                    i < faqs.length - 1 && "border-b border-border"
                  )}
                >
                  <button
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <span className="text-[12px] font-medium text-text">{f.q}</span>
                    {open ? (
                      <ChevronUp className="w-4 h-4 text-text-subtle shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-subtle shrink-0" />
                    )}
                  </button>
                  {open && (
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1.5 m-0">
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader title="Contact us" />
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="bg-canvas border border-border rounded-lg px-3 py-2.5 text-[12px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What do you need help with?"
                rows={5}
                className="bg-canvas border border-border rounded-lg px-3 py-2.5 text-[12px] text-text outline-none focus:border-gold/40 placeholder:text-text-subtle resize-none"
              />
              <button
                type="submit"
                className="py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition"
              >
                <Send className="w-3.5 h-3.5" /> Send message
              </button>
            </form>
            <p className="text-[9px] text-text-subtle mt-3 m-0 text-center">
              Opens your email client. We&apos;ll reply within 24 hours.
            </p>
          </Card>

          <Card>
            <CardHeader title="Other channels" />
            <div className="flex flex-col gap-2">
              <a
                href="mailto:support@investure.app"
                className="flex items-center gap-3 px-3 py-2.5 bg-canvas border border-border rounded-lg hover:bg-card-elev transition"
              >
                <div className="w-7 h-7 rounded-md bg-blue/15 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] m-0">Email</p>
                  <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                    support@investure.app
                  </p>
                </div>
              </a>
              <a
                href="/faq"
                className="flex items-center gap-3 px-3 py-2.5 bg-canvas border border-border rounded-lg hover:bg-card-elev transition"
              >
                <div className="w-7 h-7 rounded-md bg-gold/15 flex items-center justify-center">
                  <HelpCircle className="w-3.5 h-3.5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] m-0">Help &amp; FAQ</p>
                  <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                    Answers, screenshots and walkthrough videos from the team
                  </p>
                </div>
              </a>
              <a
                href="/community#admin"
                className="flex items-center gap-3 px-3 py-2.5 bg-canvas border border-border rounded-lg hover:bg-card-elev transition"
              >
                <div className="w-7 h-7 rounded-md bg-green/15 flex items-center justify-center">
                  <MessageCircle className="w-3.5 h-3.5 text-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] m-0">Message the admin</p>
                  <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                    Private chat in the Community tab
                  </p>
                </div>
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
