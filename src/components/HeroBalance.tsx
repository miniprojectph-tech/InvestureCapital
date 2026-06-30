"use client";

import { motion } from "framer-motion";
import { formatPHP } from "@/lib/utils";
import { TickingBalance } from "./TickingBalance";

type HeroBalanceProps = {
  wallet: number;
  deployed: number;
  vault: number;
};

export function HeroBalance({ wallet, deployed, vault }: HeroBalanceProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
      className="mb-6"
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] text-text-subtle uppercase tracking-[0.18em]">
          Total portfolio value
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border-gold to-transparent" />
      </div>
      <p
        className="m-0 leading-none tracking-tight text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: "clamp(34px, 6vw, 52px)",
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
          letterSpacing: "-0.025em",
        }}
      >
        <TickingBalance base={vault} offset={wallet + deployed} decimals={2} />
      </p>
      <div className="flex gap-5 mt-3 text-[11px] flex-wrap">
        <span className="text-text-subtle">
          Wallet{" "}
          <span className="text-text font-medium font-mono ml-1">
            {formatPHP(wallet, { short: true })}
          </span>
        </span>
        <span className="text-text-dim">·</span>
        <span className="text-text-subtle">
          Deployed{" "}
          <span className="text-text font-medium font-mono ml-1">
            {formatPHP(deployed, { short: true })}
          </span>
        </span>
        <span className="text-text-dim">·</span>
        <span className="text-text-subtle">
          Vault{" "}
          <span className="text-vault font-medium font-mono ml-1">
            <TickingBalance base={vault} decimals={2} />
          </span>
        </span>
      </div>
    </motion.div>
  );
}
