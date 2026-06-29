import { formatPHP } from "@/lib/utils";
import { TickingBalance } from "./TickingBalance";

type HeroBalanceProps = {
  wallet: number;
  deployed: number;
  vault: number;
};

export function HeroBalance({ wallet, deployed, vault }: HeroBalanceProps) {
  return (
    <div className="mb-4">
      <p className="text-[11px] text-text-subtle uppercase tracking-wide m-0 mb-1">
        Total portfolio value
      </p>
      <p className="text-[28px] font-medium font-mono text-text m-0 leading-none tracking-tight">
        <TickingBalance base={vault} offset={wallet + deployed} decimals={2} />
      </p>
      <div className="flex gap-4 mt-2 text-[11px] flex-wrap">
        <span className="text-text-subtle">
          Wallet{" "}
          <span className="text-text font-medium font-mono ml-0.5">
            {formatPHP(wallet, { short: true })}
          </span>
        </span>
        <span className="text-text-subtle">
          Deployed{" "}
          <span className="text-text font-medium font-mono ml-0.5">
            {formatPHP(deployed, { short: true })}
          </span>
        </span>
        <span className="text-text-subtle">
          Vault{" "}
          <span className="text-gold font-medium font-mono ml-0.5">
            <TickingBalance base={vault} decimals={2} />
          </span>
        </span>
      </div>
    </div>
  );
}
