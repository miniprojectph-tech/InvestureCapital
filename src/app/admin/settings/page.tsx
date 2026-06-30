"use client";

import { useEffect, useState } from "react";
import {
  Save,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Building2,
  Smartphone,
  CreditCard,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  useSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  DEFAULT_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PlatformSettings,
  type PaymentMethodConfig,
  type PaymentMethodId,
} from "@/lib/settings";

const methodIcons = {
  gotyme: Building2,
  gcash: Smartphone,
  bankTransfer: CreditCard,
} as const;

const methodAccountLabel: Record<PaymentMethodId, string> = {
  gotyme: "Account number",
  gcash: "Phone number",
  bankTransfer: "Account number",
};

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();
  const [draft, setDraft] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) setDraft({ ...settings, paymentMethods: { ...DEFAULT_PAYMENT_METHODS, ...settings.paymentMethods } });
  }, [loading, settings]);

  async function save() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) {
      setError("Admin role required to save settings.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSettings(db, draft, user.uid);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function patchMethod(id: PaymentMethodId, patch: Partial<PaymentMethodConfig>) {
    setDraft((d) => ({
      ...d,
      paymentMethods: {
        ...DEFAULT_PAYMENT_METHODS,
        ...d.paymentMethods,
        [id]: { ...DEFAULT_PAYMENT_METHODS[id], ...d.paymentMethods?.[id], ...patch },
      },
    }));
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-5 h-5 text-vault animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <TopHeader
        title="Platform settings"
        subtitle={
          settings.updatedAt
            ? `Live from Firestore · last updated ${new Date(settings.updatedAt).toLocaleString("en-PH")}`
            : "Live from Firestore · using defaults"
        }
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

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
                value={draft.vaultDailyRate}
                onChange={(e) =>
                  setDraft({ ...draft, vaultDailyRate: parseFloat(e.target.value) || 0 })
                }
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-vault/40 w-32"
              />
            </Field>
            <Field
              label="Vault lock duration (days)"
              hint="How many days the vault is locked from first activation before withdrawals are allowed."
            >
              <input
                type="number"
                value={draft.vaultLockDays}
                onChange={(e) =>
                  setDraft({ ...draft, vaultLockDays: parseInt(e.target.value) || 0 })
                }
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-vault/40 w-32"
              />
            </Field>
            <p className="text-[10px] text-text-subtle m-0 px-1 pt-1 border-t border-border">
              Multiplier at {draft.vaultDailyRate}% daily over {draft.vaultLockDays}d:{" "}
              <span className="font-mono text-vault">
                {Math.pow(1 + draft.vaultDailyRate / 100, draft.vaultLockDays).toFixed(2)}×
              </span>
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="New investor defaults" />
          <div className="flex flex-col gap-4">
            <Field label="Starter wallet balance" hint="Demo balance auto-credited on signup. 0 = no auto-credit.">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-subtle">₱</span>
                <input
                  type="number"
                  value={draft.starterBalance}
                  onChange={(e) =>
                    setDraft({ ...draft, starterBalance: parseInt(e.target.value) || 0 })
                  }
                  className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40 w-32"
                />
              </div>
            </Field>
            <Field label="Auto-activate a starter plan" hint="Give every new signup an active plan immediately.">
              <Toggle on={draft.autoSeed} onChange={(v) => setDraft({ ...draft, autoSeed: v })} />
            </Field>
          </div>
        </Card>
      </div>

      {/* Payment methods config */}
      <Card className="mb-3">
        <CardHeader
          title="Payment methods"
          subtitle="Enable the channels investors can use to send funds. They'll see the account details when submitting a top-up."
        />
        <div className="flex flex-col gap-3">
          {(["gotyme", "gcash", "bankTransfer"] as PaymentMethodId[]).map((id) => {
            const Icon = methodIcons[id];
            const cfg = draft.paymentMethods?.[id] ?? DEFAULT_PAYMENT_METHODS[id];
            return (
              <div
                key={id}
                className={cnInline(
                  "border rounded-lg p-4 transition",
                  cfg.enabled ? "border-border-gold bg-gold/5" : "border-border bg-canvas/50"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cnInline(
                        "w-9 h-9 rounded-lg flex items-center justify-center",
                        cfg.enabled ? "bg-gold/20 text-gold" : "bg-card-elev text-text-muted"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium m-0">{PAYMENT_METHOD_LABELS[id]}</p>
                      <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                        {cfg.enabled ? "Visible to investors" : "Hidden from investors"}
                      </p>
                    </div>
                  </div>
                  <Toggle on={cfg.enabled} onChange={(v) => patchMethod(id, { enabled: v })} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {id === "bankTransfer" && (
                    <Field label="Bank name">
                      <input
                        type="text"
                        value={cfg.extra ?? ""}
                        onChange={(e) => patchMethod(id, { extra: e.target.value })}
                        placeholder="e.g. BPI, BDO, UnionBank"
                        className="bg-canvas border border-border rounded-md px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full"
                      />
                    </Field>
                  )}
                  <Field label="Account name">
                    <input
                      type="text"
                      value={cfg.accountName}
                      onChange={(e) => patchMethod(id, { accountName: e.target.value })}
                      placeholder="e.g. Investure Capital Inc."
                      className="bg-canvas border border-border rounded-md px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40 w-full"
                    />
                  </Field>
                  <Field label={methodAccountLabel[id]}>
                    <input
                      type="text"
                      value={cfg.accountNumber}
                      onChange={(e) => patchMethod(id, { accountNumber: e.target.value })}
                      placeholder={id === "gcash" ? "09XX-XXX-XXXX" : "1234-5678-9012"}
                      className="bg-canvas border border-border rounded-md px-3 py-2 text-[12px] font-mono text-text outline-none focus:border-gold/40 w-full"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mb-3">
        <CardHeader title="Platform state" />
        <div className="flex items-center justify-between gap-3 p-3 bg-canvas border border-border rounded-lg">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center ${
                draft.maintenanceMode ? "bg-red/15" : "bg-green/15"
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 ${draft.maintenanceMode ? "text-red" : "text-green"}`}
              />
            </div>
            <div>
              <p className="text-[12px] font-medium m-0">Maintenance mode</p>
              <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                {draft.maintenanceMode
                  ? "Investor app shows a maintenance banner; actions blocked."
                  : "Investors can sign in and use the platform normally."}
              </p>
            </div>
          </div>
          <Toggle on={draft.maintenanceMode} onChange={(v) => setDraft({ ...draft, maintenanceMode: v })} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-[11px] text-green">Saved to Firestore</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-2 hover:brightness-110 transition disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save changes"}
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
        {hint ? null : children}
      </div>
      {!hint && children ? null : <>{children}</>}
      {hint && <p className="text-[10px] text-text-subtle m-0 mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition shrink-0 ${on ? "bg-gold" : "bg-card-elev"}`}
      aria-pressed={on}
      type="button"
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function cnInline(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
