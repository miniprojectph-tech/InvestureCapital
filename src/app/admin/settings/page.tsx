"use client";

import { useState } from "react";
import { Save, AlertTriangle } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";

export default function AdminSettingsPage() {
  const [vaultRate, setVaultRate] = useState(1.0);
  const [lockDays, setLockDays] = useState(365);
  const [starterBalance, setStarterBalance] = useState(10000);
  const [autoSeed, setAutoSeed] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <TopHeader title="Platform settings" subtitle="Configure compounding mechanics, defaults, and platform state" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card>
          <CardHeader title="Compounding mechanics" />
          <div className="flex flex-col gap-4">
            <Field
              label="Vault daily rate (%)"
              hint="The percentage the Future Growth Vault compounds each day. Default 1.0%."
            >
              <input
                type="number"
                step="0.1"
                value={vaultRate}
                onChange={(e) => setVaultRate(parseFloat(e.target.value) || 0)}
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-vault/40 w-32"
              />
            </Field>
            <Field
              label="Vault lock duration (days)"
              hint="How many days the vault is locked from first activation before withdrawals are allowed."
            >
              <input
                type="number"
                value={lockDays}
                onChange={(e) => setLockDays(parseInt(e.target.value) || 0)}
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-vault/40 w-32"
              />
            </Field>
            <p className="text-[10px] text-text-subtle m-0 px-1 pt-1 border-t border-border">
              Current multiplier at {vaultRate}% daily over {lockDays}d:{" "}
              <span className="font-mono text-vault">
                {Math.pow(1 + vaultRate / 100, lockDays).toFixed(2)}×
              </span>
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="New investor defaults" />
          <div className="flex flex-col gap-4">
            <Field label="Starter wallet balance" hint="Demo balance auto-credited on signup.">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-subtle">₱</span>
                <input
                  type="number"
                  value={starterBalance}
                  onChange={(e) => setStarterBalance(parseInt(e.target.value) || 0)}
                  className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40 w-32"
                />
              </div>
            </Field>
            <Field label="Auto-activate a starter plan" hint="Give every new signup an active plan immediately.">
              <Toggle on={autoSeed} onChange={setAutoSeed} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader title="Platform state" />
        <div className="flex items-center justify-between gap-3 p-3 bg-canvas border border-border rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${maintenance ? "bg-red/15" : "bg-green/15"}`}>
              <AlertTriangle className={`w-4 h-4 ${maintenance ? "text-red" : "text-green"}`} />
            </div>
            <div>
              <p className="text-[12px] font-medium m-0">Maintenance mode</p>
              <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                {maintenance
                  ? "Investor app is currently showing a maintenance banner."
                  : "Investors can sign in and use the platform normally."}
              </p>
            </div>
          </div>
          <Toggle on={maintenance} onChange={setMaintenance} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-[11px] text-green">Settings saved (UI only)</span>
        )}
        <button
          onClick={save}
          className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-2 hover:brightness-110 transition"
        >
          <Save className="w-3.5 h-3.5" /> Save changes
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="text-[11px] font-medium text-text">{label}</label>
        {children}
      </div>
      {hint && <p className="text-[10px] text-text-subtle m-0">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition ${on ? "bg-gold" : "bg-card-elev"}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
