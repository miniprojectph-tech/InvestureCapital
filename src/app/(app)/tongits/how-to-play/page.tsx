"use client";

import { HelpCircle } from "lucide-react";
import { TongitsShell, ArcadePanel, T } from "@/components/TongitsShell";

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "The goal",
    points: [
      "3 players, standard 52-card deck. Empty your hand to win by Tongits — or hold the lowest-value hand at a showdown.",
      "Card values (lower is better): Ace = 1, 2–10 = face value, J/Q/K = 10.",
    ],
  },
  {
    title: "Your turn",
    points: [
      "Draw one card — from the stock, or take the top discard if you immediately use it in a meld.",
      "Optionally meld or sapaw (see below).",
      "Discard one card to end your turn — unless you just emptied your hand (that's Tongits!).",
    ],
  },
  {
    title: "Melds",
    points: [
      "Set: 3–4 cards of the same rank (e.g. 7♠ 7♥ 7♦).",
      "Run: 3+ consecutive cards of the same suit (e.g. 4♣ 5♣ 6♣). Ace is low only (A-2-3, never Q-K-A).",
      "Sapaw: add a valid card to any exposed meld — yours or an opponent's.",
    ],
  },
  {
    title: "Winning",
    points: [
      "Tongits: play your last card to win instantly — and claim the jackpot. Never exposing a meld until the winning turn is a Secret Tongits (bonus ranking points).",
      "Call (Tumba): with at least one exposed meld, call for a showdown — lowest hand wins (ties go to the caller).",
      "Stock runs out: the round ends and the lowest hand wins.",
    ],
  },
  {
    title: "Points & jackpot",
    points: [
      "Everyone stakes the challenge amount; the winner takes the whole pool.",
      "A small ante each game feeds a running jackpot that only pays out on a true Tongits — otherwise it carries over.",
      "Game Points are for play and rewards only — not cash, never withdrawable.",
    ],
  },
];

export default function HowToPlayPage() {
  return (
    <TongitsShell>
      <div className="flex items-center justify-center gap-3 mb-3">
        <HelpCircle className="w-5 h-5" style={{ color: T.gold }} />
        <h2 className="text-[15px] font-bold uppercase tracking-widest m-0">How to Play</h2>
      </div>

      <div className="max-w-2xl mx-auto flex flex-col gap-3">
        {SECTIONS.map((s) => (
          <ArcadePanel key={s.title}>
            <p className="text-[13px] font-bold m-0 mb-2" style={{ color: T.gold }}>
              {s.title}
            </p>
            <ul className="m-0 pl-4 flex flex-col gap-1.5">
              {s.points.map((p, i) => (
                <li key={i} className="text-[12px] text-white/80 leading-relaxed">
                  {p}
                </li>
              ))}
            </ul>
          </ArcadePanel>
        ))}
      </div>
    </TongitsShell>
  );
}
