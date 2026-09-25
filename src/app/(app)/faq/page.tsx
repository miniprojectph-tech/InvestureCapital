"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, ThumbsUp, ThumbsDown, Link2, Check, MessageCircle, Loader2 } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { FaqAnswer } from "@/components/faq/FaqAnswer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useFaq, useFaqVotes, useMyFaqVotes, voteFaq, faqCategories, faqPlainText, type FaqItem } from "@/lib/faq";

export default function FaqPage() {
  const { user, demoMode } = useAuth();
  const { faq, loading } = useFaq();
  const votes = useFaqVotes();
  const mine = useMyFaqVotes();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const jumped = useRef(false);

  const published = useMemo(() => faq.items.filter((it) => it.status === "published"), [faq.items]);
  const categories = useMemo(() => faqCategories(published), [published]);

  // Deep link: /faq#<id> opens that question once the list has loaded.
  useEffect(() => {
    if (loading || jumped.current || typeof window === "undefined") return;
    const id = window.location.hash.slice(1);
    if (!id || !published.some((it) => it.id === id)) return;
    jumped.current = true;
    setOpen(id);
    setCategory("all");
    setTimeout(() => document.getElementById(`faq-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [loading, published]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      published.filter((it) => {
        if (category !== "all" && it.category !== category) return false;
        if (!q) return true;
        return it.question.toLowerCase().includes(q) || faqPlainText(it.answer).toLowerCase().includes(q);
      }),
    [published, category, q],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const it of visible) map.set(it.category, [...(map.get(it.category) ?? []), it]);
    return [...map.entries()];
  }, [visible]);

  async function vote(item: FaqItem, helpful: boolean) {
    if (!user || demoMode || voting) return;
    setVoting(item.id);
    try {
      await voteFaq(item.id, mine[item.id] === helpful ? null : helpful);
    } catch {
      /* ignore */
    } finally {
      setVoting(null);
    }
  }

  function copyLink(item: FaqItem) {
    const url = `${window.location.origin}/faq#${item.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    });
  }

  return (
    <div>
      <TopHeader title="Help & FAQ" subtitle="Answers from the Investure team. Tap a question to open it." />

      <div className="flex flex-col gap-3 max-w-[860px]">
        <div className="flex items-center gap-2.5 h-11 rounded-xl bg-card border border-border px-3.5 focus-within:border-gold/40">
          <Search className="w-4 h-4 text-text-subtle shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions, e.g. withdrawal schedule"
            aria-label="Search questions"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-text outline-none placeholder:text-text-subtle"
          />
        </div>

        {categories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
            <Chip on={category === "all"} onClick={() => setCategory("all")}>All · {published.length}</Chip>
            {categories.map((c) => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>{c}</Chip>
            ))}
          </div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 text-gold animate-spin" /></div>
        ) : published.length === 0 ? (
          <p className="text-[12px] text-text-subtle text-center py-12 m-0">No questions published yet. Check back soon, or message the admin below.</p>
        ) : visible.length === 0 ? (
          <p className="text-[12px] text-text-subtle text-center py-12 m-0">Nothing matches &ldquo;{query}&rdquo;. Try another word, or message the admin below.</p>
        ) : (
          grouped.map(([cat, items]) => (
            <div key={cat} className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-text-subtle px-0.5 pt-1">{cat}</span>
              {items.map((it) => {
                const isOpen = open === it.id;
                const v = votes[it.id] ?? { up: 0, down: 0 };
                const my = mine[it.id];
                return (
                  <div id={`faq-${it.id}`} key={it.id} className={cn("bg-card border rounded-2xl overflow-hidden transition-colors scroll-mt-20", isOpen ? "border-gold/40" : "border-border")}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : it.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    >
                      <span className="flex-1 text-[13.5px] font-semibold text-text leading-snug">{it.question}</span>
                      <ChevronDown className={cn("w-[18px] h-[18px] shrink-0 transition-transform", isOpen ? "rotate-180 text-gold" : "text-text-subtle")} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 flex flex-col gap-3.5">
                        <FaqAnswer item={it} />
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-text-muted">Was this helpful?</span>
                            <VoteButton on={my === true} count={v.up} busy={voting === it.id} onClick={() => vote(it, true)} icon={ThumbsUp} label="Helpful" />
                            <VoteButton on={my === false} count={v.down} busy={voting === it.id} onClick={() => vote(it, false)} icon={ThumbsDown} label="Not helpful" muted />
                          </div>
                          <button type="button" onClick={() => copyLink(it)} className="flex items-center gap-1.5 text-[11px] text-text-subtle hover:text-text px-2 py-1 rounded-full">
                            {copied === it.id ? <><Check className="w-3.5 h-3.5 text-gold" /> Link copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy link</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}

        <Link href="/community#admin" className="mt-2 flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border hover:bg-card-elev transition">
          <div className="w-9 h-9 rounded-full bg-gold/15 flex items-center justify-center shrink-0"><MessageCircle className="w-4 h-4 text-gold" /></div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold m-0">Still need help?</p>
            <p className="text-[11px] text-text-muted m-0">Message the admin. We reply in your private chat.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition border", on ? "bg-gold text-gold-dark border-gold" : "bg-card border-border text-text-muted hover:text-text")}>
      {children}
    </button>
  );
}

function VoteButton({ on, count, busy, onClick, icon: Icon, label, muted }: { on: boolean; count: number; busy: boolean; onClick: () => void; icon: typeof ThumbsUp; label: string; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] transition disabled:opacity-60",
        on ? (muted ? "border-red/40 bg-red/10 text-red" : "border-gold/40 bg-gold/10 text-gold") : "border-border-strong text-text-muted hover:text-text",
      )}
    >
      <Icon className="w-3.5 h-3.5" /> <span className="font-mono">{count}</span>
    </button>
  );
}
