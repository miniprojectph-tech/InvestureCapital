"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Save,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Building2,
  Smartphone,
  CreditCard,
  Upload,
  Trash2,
  ImageOff,
  Bot,
  Eye,
  EyeOff,
  CalendarClock,
  Wallet,
  Sliders,
  Power,
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
  DEFAULT_AI_TRADING,
  PAYMENT_METHOD_LABELS,
  type PlatformSettings,
  type PaymentMethodConfig,
  type PaymentMethodId,
  type AiTradingProvider,
} from "@/lib/settings";
import { uploadPaymentMethodQr, deletePaymentMethodQr } from "@/lib/storage";
import {
  mergeWithdrawalSchedule,
  describeSchedule,
  releaseDateFor,
  formatReleaseDate,
  DAY_SHORT,
  type WithdrawalScheduleConfig,
} from "@/lib/withdrawalSchedule";


type Tab = "general" | "payments" | "withdrawals" | "ai" | "state";
const TABS: { id: Tab; label: string; icon: typeof Sliders }[] = [
  { id: "general", label: "General", icon: Sliders },
  { id: "payments", label: "Payment methods", icon: Wallet },
  { id: "withdrawals", label: "Withdrawals", icon: CalendarClock },
  { id: "ai", label: "AI Trading", icon: Bot },
  { id: "state", label: "Platform state", icon: Power },
];

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
  const [uploadingQr, setUploadingQr] = useState<PaymentMethodId | null>(null);
  // One group at a time — no long page. #withdrawal-schedule (from the queue's "Edit schedule") opens that tab.
  const [tab, setTab] = useState<Tab>("general");
  useEffect(() => {
    if (window.location.hash === "#withdrawal-schedule") setTab("withdrawals");
  }, []);

  const baseline = useMemo(
    () => ({
      ...settings,
      paymentMethods: { ...DEFAULT_PAYMENT_METHODS, ...settings.paymentMethods },
      aiTrading: { ...DEFAULT_AI_TRADING, ...settings.aiTrading },
      withdrawalSchedule: mergeWithdrawalSchedule(settings.withdrawalSchedule),
    }),
    [settings],
  );
  const dirty = !loading && JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!loading)
      setDraft({
        ...settings,
        paymentMethods: { ...DEFAULT_PAYMENT_METHODS, ...settings.paymentMethods },
        aiTrading: { ...DEFAULT_AI_TRADING, ...settings.aiTrading },
        withdrawalSchedule: mergeWithdrawalSchedule(settings.withdrawalSchedule),
      });
  }, [loading, settings]);

  const schedule = mergeWithdrawalSchedule(draft.withdrawalSchedule);
  const patchSchedule = (p: Partial<WithdrawalScheduleConfig>) =>
    setDraft({ ...draft, withdrawalSchedule: mergeWithdrawalSchedule({ ...schedule, ...p }) });

  const [showSecret, setShowSecret] = useState(false);
  const [showKey, setShowKey] = useState(false);

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

  async function uploadQr(id: PaymentMethodId, file: File) {
    const { db, storage } = getFirebase();
    if (!db || !storage || !user?.isAdmin) {
      setError("Admin role and Firebase Storage required.");
      return;
    }
    setUploadingQr(id);
    setError(null);
    try {
      const oldPath = draft.paymentMethods?.[id]?.qrCodePath;
      const uploaded = await uploadPaymentMethodQr(storage, id, file);
      // Patch local draft AND persist immediately so the QR link is live
      const next = {
        ...DEFAULT_PAYMENT_METHODS,
        ...draft.paymentMethods,
        [id]: {
          ...DEFAULT_PAYMENT_METHODS[id],
          ...draft.paymentMethods?.[id],
          qrCodeUrl: uploaded.url,
          qrCodePath: uploaded.path,
        },
      };
      setDraft((d) => ({ ...d, paymentMethods: next }));
      await saveSettings(db, { paymentMethods: next }, user.uid);
      // Best-effort delete of the previous file
      if (oldPath && oldPath !== uploaded.path) {
        deletePaymentMethodQr(storage, oldPath).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingQr(null);
    }
  }

  async function removeQr(id: PaymentMethodId) {
    const { db, storage } = getFirebase();
    if (!db || !storage || !user?.isAdmin) return;
    const oldPath = draft.paymentMethods?.[id]?.qrCodePath;
    const next = {
      ...DEFAULT_PAYMENT_METHODS,
      ...draft.paymentMethods,
      [id]: {
        ...DEFAULT_PAYMENT_METHODS[id],
        ...draft.paymentMethods?.[id],
        qrCodeUrl: "",
        qrCodePath: "",
      },
    };
    setDraft((d) => ({ ...d, paymentMethods: next }));
    try {
      await saveSettings(db, { paymentMethods: next }, user.uid);
      if (oldPath) deletePaymentMethodQr(storage, oldPath).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
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

      {/* Tab bar + Save, pinned so every group is one click away and Save is never off-screen */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 mb-3 bg-canvas/95 backdrop-blur-sm flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-xl bg-card border border-border overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            const hint =
              t.id === "payments" ? `${(Object.values(draft.paymentMethods ?? DEFAULT_PAYMENT_METHODS).filter((m) => m.enabled).length)} of 3 on`
              : t.id === "withdrawals" ? (schedule.enabled && schedule.releaseDays.length ? schedule.releaseDays.slice().sort().map((d) => DAY_SHORT[d]).join(" · ") : "off")
              : t.id === "ai" ? (draft.aiTrading?.enabled ? "on" : "off")
              : t.id === "state" ? (draft.maintenanceMode ? "maintenance" : "live")
              : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cnInline(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] whitespace-nowrap transition",
                  on ? "bg-gold/15 text-gold font-medium" : "text-text-muted hover:text-text"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {hint && (
                  <span className={cnInline("text-[9px] px-1.5 py-0.5 rounded-full", on ? "bg-gold/15" : "bg-card-elev text-text-subtle", t.id === "state" && !draft.maintenanceMode && "text-green")}>
                    {hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-[11px] text-green">Saved</span>}
          {dirty && !saved && <span className="text-[10px] px-2 py-1 rounded-full bg-[#F5C66B]/10 border border-[#F5C66B]/30 text-[#F5C66B]">Unsaved changes</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {tab === "general" && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
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

        <Card>
          <CardHeader title="At a glance" subtitle="Current values of the other groups — tap a row to open it" />
          <div className="flex flex-col gap-2">
            {([
              ["payments", "Payment methods", `${(Object.values(draft.paymentMethods ?? DEFAULT_PAYMENT_METHODS).filter((m) => m.enabled).length)} of 3 enabled`],
              ["withdrawals", "Withdrawal release", schedule.enabled && schedule.releaseDays.length ? schedule.releaseDays.slice().sort().map((d) => DAY_SHORT[d]).join(" & ") : "Off"],
              ["ai", "AI Trading", draft.aiTrading?.enabled ? `On · ${draft.aiTrading.provider}` : "Off"],
              ["state", "Maintenance mode", draft.maintenanceMode ? "ON — investors blocked" : "Off · live"],
            ] as [Tab, string, string][]).map(([id, label, value]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-canvas border border-border text-left hover:border-gold/40 transition"
              >
                <span className="text-[11px] text-text-muted">{label}</span>
                <span className={cnInline("text-[11px]", id === "state" && (draft.maintenanceMode ? "text-red" : "text-green"))}>{value}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
      )}

      {tab === "payments" && (
      <Card className="mb-3">
        <CardHeader
          title="Payment methods"
          subtitle="Enable the channels investors can use to send funds. They'll see the account details when submitting a top-up."
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2.5">
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

                  {/* QR code uploader */}
                  <div className="flex items-center gap-3 pt-3 border-t border-border">
                    <div className="relative w-[72px] h-[72px] rounded-lg overflow-hidden border border-border bg-canvas flex items-center justify-center shrink-0">
                      {cfg.qrCodeUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cfg.qrCodeUrl}
                            alt={`${PAYMENT_METHOD_LABELS[id]} QR`}
                            className="w-full h-full object-contain bg-white p-1.5"
                          />
                          {uploadingQr === id && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-gold animate-spin" />
                            </div>
                          )}
                        </>
                      ) : uploadingQr === id ? (
                        <Loader2 className="w-5 h-5 text-gold animate-spin" />
                      ) : (
                        <ImageOff className="w-6 h-6 text-text-dim" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <label className="text-[11px] font-medium text-text">QR code</label>
                    <div className="flex gap-1.5">
                      <label
                        className={cnInline(
                          "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] border transition cursor-pointer",
                          uploadingQr === id
                            ? "border-border text-text-subtle cursor-wait"
                            : "border-border-strong text-text-muted hover:bg-card-elev hover:text-text"
                        )}
                      >
                        <Upload className="w-3 h-3" />
                        {cfg.qrCodeUrl ? "Replace" : "Upload"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          disabled={uploadingQr === id}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadQr(id, f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {cfg.qrCodeUrl && (
                        <button
                          type="button"
                          onClick={() => removeQr(id)}
                          disabled={uploadingQr === id}
                          className="px-2 py-1.5 rounded-md text-[10px] border border-border-strong text-red hover:bg-red/10 disabled:opacity-60"
                          aria-label="Remove QR"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-text-subtle m-0">PNG / JPG · max 2 MB</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      )}

      {tab === "ai" && (
      <Card className="mb-3">
        <CardHeader
          title="AI Trading engine"
          subtitle="Wire up the crypto trading provider. Investors unlock the tab once their wallet balance reaches the threshold below."
        />
        <div className="flex items-center justify-between gap-3 p-3 bg-canvas border border-border rounded-lg mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-md flex items-center justify-center ${
                draft.aiTrading?.enabled ? "bg-gold/15 text-gold" : "bg-card-elev text-text-muted"
              }`}
            >
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[12px] font-medium m-0">
                {draft.aiTrading?.enabled ? "Trading engine active" : "Trading engine disabled"}
              </p>
              <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                {draft.aiTrading?.enabled
                  ? `Provider: ${draft.aiTrading.provider} · Unlock at ₱${(draft.aiTrading.unlockThreshold ?? 0).toLocaleString()}`
                  : "Investors see the AI Trading tab locked with the wallet threshold overlay"}
              </p>
            </div>
          </div>
          <Toggle
            on={!!draft.aiTrading?.enabled}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                aiTrading: { ...DEFAULT_AI_TRADING, ...d.aiTrading, enabled: v },
              }))
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <Field label="Provider">
            <select
              value={draft.aiTrading?.provider ?? "binance"}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  aiTrading: {
                    ...DEFAULT_AI_TRADING,
                    ...d.aiTrading,
                    provider: e.target.value as AiTradingProvider,
                  },
                }))
              }
              className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] text-text outline-none focus:border-gold/40 w-full"
            >
              <option value="binance">Binance</option>
              <option value="okx">OKX</option>
              <option value="kraken">Kraken</option>
              <option value="custom">Custom endpoint</option>
            </select>
          </Field>
          <Field label="Unlock threshold (₱ wallet balance)">
            <input
              type="number"
              value={draft.aiTrading?.unlockThreshold ?? 100000}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  aiTrading: {
                    ...DEFAULT_AI_TRADING,
                    ...d.aiTrading,
                    unlockThreshold: parseInt(e.target.value) || 0,
                  },
                }))
              }
              className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40 w-full"
            />
          </Field>
        </div>

        <Field label="API endpoint">
          <input
            type="text"
            value={draft.aiTrading?.apiEndpoint ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                aiTrading: { ...DEFAULT_AI_TRADING, ...d.aiTrading, apiEndpoint: e.target.value },
              }))
            }
            placeholder="https://api.binance.com or your custom URL"
            className="bg-canvas border border-border rounded-md px-3 py-2 text-[12px] font-mono text-text outline-none focus:border-gold/40 w-full mt-1.5"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Field label="API key">
            <div className="flex items-center gap-1 bg-canvas border border-border rounded-md px-3 py-2 focus-within:border-gold/40">
              <input
                type={showKey ? "text" : "password"}
                value={draft.aiTrading?.apiKey ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    aiTrading: { ...DEFAULT_AI_TRADING, ...d.aiTrading, apiKey: e.target.value },
                  }))
                }
                placeholder="Paste API key"
                className="flex-1 bg-transparent text-[12px] font-mono text-text outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="text-text-subtle hover:text-text"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>
          <Field label="API secret">
            <div className="flex items-center gap-1 bg-canvas border border-border rounded-md px-3 py-2 focus-within:border-gold/40">
              <input
                type={showSecret ? "text" : "password"}
                value={draft.aiTrading?.apiSecret ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    aiTrading: { ...DEFAULT_AI_TRADING, ...d.aiTrading, apiSecret: e.target.value },
                  }))
                }
                placeholder="Paste API secret"
                className="flex-1 bg-transparent text-[12px] font-mono text-text outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="text-text-subtle hover:text-text"
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>
        </div>

        <Field label="Supported pairs (comma-separated)">
          <input
            type="text"
            value={(draft.aiTrading?.supportedPairs ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                aiTrading: {
                  ...DEFAULT_AI_TRADING,
                  ...d.aiTrading,
                  supportedPairs: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              }))
            }
            placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
            className="bg-canvas border border-border rounded-md px-3 py-2 text-[12px] font-mono text-text outline-none focus:border-gold/40 w-full mt-1.5"
          />
        </Field>

        <p className="text-[10px] text-text-subtle mt-3 m-0">
          Note: API credentials are stored in Firestore for prototype convenience. In production
          they should be kept server-side (Cloud Function or backend proxy) so investors never
          receive them in the browser.
        </p>
      </Card>
      )}

      {tab === "withdrawals" && (
      <Card className="mb-3">
        <div id="withdrawal-schedule" className="scroll-mt-4" />
        <CardHeader
          title="Withdrawal release schedule"
          subtitle="Members can request any day; this decides which day their payout is released and is shown to them before they confirm"
          right={<Toggle on={schedule.enabled} onChange={(v) => patchSchedule({ enabled: v })} />}
        />
        <div className={cnInline("flex flex-col gap-4", !schedule.enabled && "opacity-50 pointer-events-none")}>
          <Field label="Release days" hint="Payouts go out on these days. A request is released on the next release day after the day it was made.">
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = schedule.releaseDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => patchSchedule({ releaseDays: on ? schedule.releaseDays.filter((x) => x !== d) : [...schedule.releaseDays, d] })}
                    className={cnInline(
                      "px-3 py-1.5 rounded-full text-[11px] border transition",
                      on ? "bg-gold/15 border-gold/40 text-gold font-medium" : "bg-canvas border-border text-text-muted hover:text-text"
                    )}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Same-day cutoff (optional)" hint="If set, a request made on a release day before this time is released that same day. Leave empty so every request waits for the next release day.">
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={schedule.sameDayCutoff ?? ""}
                  onChange={(e) => patchSchedule({ sameDayCutoff: e.target.value || null })}
                  className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40 [color-scheme:dark]"
                />
                {schedule.sameDayCutoff && (
                  <button type="button" onClick={() => patchSchedule({ sameDayCutoff: null })} className="text-[10px] text-text-subtle hover:text-red">Clear</button>
                )}
              </div>
            </Field>
            <Field label="Note to members (optional)" hint="Shown under the schedule on the withdrawal page and in the request form.">
              <input
                type="text"
                value={schedule.note}
                maxLength={140}
                onChange={(e) => patchSchedule({ note: e.target.value })}
                placeholder="e.g. Bank holidays move to the next release day"
                className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-[12px] text-text outline-none focus:border-gold/40"
              />
            </Field>
          </div>

          <div className="px-3 py-2.5 bg-canvas border border-border rounded-lg">
            <p className="text-[11px] m-0 text-text">{describeSchedule(schedule)}</p>
            {(() => {
              const next = releaseDateFor(Date.now(), schedule);
              return (
                <p className="text-[10px] text-text-subtle m-0 mt-1">
                  {schedule.releaseDays.length === 0
                    ? "Pick at least one release day."
                    : next
                      ? `A request made right now would be released on ${formatReleaseDate(next, { withYear: true })}.`
                      : ""}
                </p>
              );
            })()}
          </div>
        </div>
      </Card>
      )}

      {tab === "state" && (
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
      )}
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
