import { formatPHP } from "@/lib/utils";

type HeroBalanceProps = {
  total: number;
  wallet: number;
  deployed: number;
  vault: number;
};

export function HeroBalance({ total, wallet, deployed, vault }: HeroBalanceProps) {
  return (
    <div className="mb-4">
      <p className="text-[11px] text-text-subtle uppercase tracking-wide m-0 mb-1">
        Total portfolio value
      </p>
      <p className="text-[28px] font-medium font-mono text-text m-0 leading-none tracking-tight">
        {formatPHP(total)}
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
            {formatPHP(vault, { short: true })}
          </span>
        </span>
      </div>
    </div>
  );
}
