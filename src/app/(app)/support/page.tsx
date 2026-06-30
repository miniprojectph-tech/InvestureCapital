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

const faqs = [
  {
    q: "How does the daily income work?",
    a: "When you activate a short-term plan, your investment earns a fixed daily percentage to your wallet for the plan's duration. The exact rate and duration are set per plan template (e.g. 10-day plan @ 2.5%/day means ₱25/day on ₱1,000 for 10 days).",
  },
  {
    q: "What is the Future Growth Vault?",
    a: "When a short-term plan completes, the total earnings are auto-credited to your Vault as a long-term holding. The Vault compounds at 1% daily and is locked for 365 days from your first activation. That's the real wealth-building engine.",
  },
  {
    q: "Can I withdraw my wallet balance anytime?",
    a: "Yes. Wallet income from short-term plans is withdrawable on demand. Vault funds are locked for 365 days from first activation, then released.",
  },
  {
    q: "What happens if I activate another plan?",
    a: "Each new plan adds to your active plans list with its own daily income stream. When each plan completes, its earnings are added to your existing Vault — so the Vault grows from every plan you run.",
  },
  {
    q: "Is this real money?",
    a: "No. Investure Capital is a simulation platform demonstrating the mathematics of compounding. All balances are illustrative. No real funds are deposited, traded, or withdrawn.",
  },
];

export default function SupportPage() {
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
              <div className="flex items-center gap-3 px-3 py-2.5 bg-canvas border border-border rounded-lg opacity-60">
                <div className="w-7 h-7 rounded-md bg-green/15 flex items-center justify-center">
                  <MessageCircle className="w-3.5 h-3.5 text-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] m-0">Live chat</p>
                  <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                    Coming soon
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
