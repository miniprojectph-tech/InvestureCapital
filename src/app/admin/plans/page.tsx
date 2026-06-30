"use client";

import { useState } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Coins,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { formatPHP, cn } from "@/lib/utils";
import { VAULT_365_MULTIPLIER } from "@/lib/mock-data";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import {
  usePlans,
  createPlan,
  updatePlan,
  deletePlan,
  seedPlansIfEmpty,
  type StoredPlan,
} from "@/lib/plans";

type Editing = StoredPlan & { _new?: boolean };

export default function AdminPlansPage() {
  const { plans, loading, isFromMock } = usePlans();
  const { user } = useAuth();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: StoredPlan) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    if (isFromMock) {
      setError("These are demo plans — click 'Seed defaults' first to write them to Firestore.");
      return;
    }
    try {
      await updatePlan(db, p.id, { active: !p.active });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  function startEdit(p: StoredPlan) {
    // If plans are still mock (Firestore empty), Save should CREATE not UPDATE
    setEditing({ ...p, _new: isFromMock });
  }

  async function seed() {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    setSeeding(true);
    try {
      await seedPlansIfEmpty(db);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  async function save(p: Editing) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    try {
      if (p._new) {
        await createPlan(db, {
          id: p.id,
          name: p.name,
          durationDays: p.durationDays,
          dailyRate: p.dailyRate,
          minInvestment: p.minInvestment,
          maxInvestment: p.maxInvestment,
          featured: p.featured,
          active: p.active,
        });
      } else {
        const { _new, ...rest } = p;
        void _new;
        await updatePlan(db, p.id, rest);
      }
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(p: StoredPlan) {
    const { db } = getFirebase();
    if (!db || !user?.isAdmin) return;
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    try {
      await deletePlan(db, p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
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
        title="Plan templates"
        subtitle={
          isFromMock
            ? "Showing demo plans — none persisted to Firestore yet"
            : "Live from Firestore — changes are visible to investors immediately"
        }
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] text-red">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isFromMock && (
        <div className="mb-3 flex items-start justify-between gap-3 px-4 py-3 bg-vault/5 border border-border-vault rounded-lg">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-vault" />
            <div>
              <p className="text-[12px] font-medium m-0 text-text">
                The /plans collection is empty in Firestore
              </p>
              <p className="text-[11px] text-text-muted mt-0.5 m-0">
                You&apos;re seeing demo plans. Click <span className="text-vault">Seed defaults</span> to write the 4 canonical templates so investors can activate them and you can edit them here.
              </p>
            </div>
          </div>
          <button
            onClick={seed}
            disabled={seeding}
            className="text-[12px] px-3 py-2 bg-vault text-vault-dark rounded-lg font-medium flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-60 shrink-0"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Seed defaults
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-text-muted m-0">
          {plans.filter((p) => p.active).length} of {plans.length} active
        </p>
        <div className="flex gap-2">
          {false && (
            <span style={{ display: "none" }} />
          )}
          <button
            onClick={() =>
              setEditing({
                id: `plan-${Date.now()}`,
                name: "New plan",
                durationDays: 10,
                dailyRate: 2,
                minInvestment: 1000,
                maxInvestment: 10000,
                featured: false,
                active: true,
                _new: true,
              })
            }
            className="text-[12px] px-3.5 py-2 bg-gold text-gold-dark rounded-lg font-medium flex items-center gap-1.5 hover:brightness-110 transition"
          >
            <Plus className="w-3.5 h-3.5" /> New plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {plans.map((p) => {
          const sampleAmount = 1000;
          const dailyIncome = sampleAmount * (p.dailyRate / 100);
          const total = dailyIncome * p.durationDays;
          const vault365 = total * VAULT_365_MULTIPLIER;

          return (
            <Card key={p.id} className={cn("flex flex-col", !p.active && "opacity-60")}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-gold" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium m-0">{p.name}</p>
                    <p className="text-[10px] text-text-subtle mt-0.5 m-0">
                      {p.durationDays} days · {p.dailyRate}% / day
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggle(p)}
                  className={cn(
                    "transition",
                    p.active ? "text-green" : "text-text-subtle hover:text-text"
                  )}
                  aria-label={p.active ? "Deactivate" : "Activate"}
                >
                  {p.active ? (
                    <ToggleRight className="w-7 h-7" strokeWidth={1.8} />
                  ) : (
                    <ToggleLeft className="w-7 h-7" strokeWidth={1.8} />
                  )}
                </button>
              </div>

              <div className="bg-canvas rounded-md p-3 mb-3">
                <p className="text-[9px] text-text-subtle uppercase tracking-wider m-0 mb-1.5">
                  Sample · ₱1,000 investment
                </p>
                <Row label="Daily income" value={formatPHP(dailyIncome)} />
                <Row label="Wallet total" value={formatPHP(total)} />
                <div className="border-t border-dashed border-vault/25 mt-1.5 pt-1.5">
                  <Row label="Vault after 365d" value={formatPHP(vault365, { short: true })} vault />
                </div>
              </div>

              <div className="flex flex-col gap-2 text-[10px] text-text-muted mb-3">
                <RowSmall label="Min investment" value={formatPHP(p.minInvestment)} />
                <RowSmall label="Max investment" value={formatPHP(p.maxInvestment)} />
                <RowSmall label="Featured" value={p.featured ? "Yes" : "No"} />
                <RowSmall
                  label="Status"
                  value={p.active ? "Active" : "Inactive"}
                  valueColor={p.active ? "text-green" : "text-text-subtle"}
                />
              </div>

              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => startEdit(p)}
                  className="flex-1 text-[11px] py-2 bg-card-elev border border-border-strong rounded-md text-text-muted hover:text-text flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => remove(p)}
                  disabled={isFromMock}
                  className="text-[11px] px-3 py-2 bg-card-elev border border-border-strong rounded-md text-red hover:bg-red/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Plan formula"
          subtitle="Daily income = capital × daily rate · Vault credit = total income · Vault compounds 1% daily"
        />
        <pre className="bg-canvas border border-border rounded-md p-3 text-[10px] font-mono text-text-muted overflow-x-auto m-0">
{`daily_income     = capital × daily_rate
wallet_total     = daily_income × duration_days
vault_credit     = wallet_total            // on plan completion
vault_after_365d = vault_credit × (1.01)^365  ≈  vault_credit × 37.78
total_return     = wallet_total + vault_after_365d`}
        </pre>
      </Card>

      <PlanEditor
        plan={editing}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </div>
  );
}

function PlanEditor({
  plan,
  onClose,
  onSave,
}: {
  plan: Editing | null;
  onClose: () => void;
  onSave: (p: Editing) => Promise<void>;
}) {
  const [local, setLocal] = useState<Editing | null>(plan);
  const [saving, setSaving] = useState(false);

  // Sync when plan prop changes
  if (plan && (!local || local.id !== plan.id)) {
    setLocal(plan);
  }
  if (!plan && local) {
    setLocal(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!local) return;
    setSaving(true);
    try {
      await onSave(local);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={local !== null}
      onClose={onClose}
      title={local?._new ? "New plan" : `Edit — ${local?.name ?? ""}`}
    >
      {local && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <FormField label="Plan name">
            <input
              value={local.name}
              onChange={(e) => setLocal({ ...local, name: e.target.value })}
              className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] text-text outline-none focus:border-gold/40"
              required
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Duration (days)">
              <input
                type="number"
                value={local.durationDays}
                onChange={(e) => setLocal({ ...local, durationDays: parseInt(e.target.value) || 0 })}
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40"
                required
                min={1}
              />
            </FormField>
            <FormField label="Daily rate (%)">
              <input
                type="number"
                step="0.1"
                value={local.dailyRate}
                onChange={(e) => setLocal({ ...local, dailyRate: parseFloat(e.target.value) || 0 })}
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40"
                required
                min={0.1}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Min investment">
              <input
                type="number"
                value={local.minInvestment}
                onChange={(e) => setLocal({ ...local, minInvestment: parseInt(e.target.value) || 0 })}
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40"
              />
            </FormField>
            <FormField label="Max investment">
              <input
                type="number"
                value={local.maxInvestment}
                onChange={(e) => setLocal({ ...local, maxInvestment: parseInt(e.target.value) || 0 })}
                className="bg-canvas border border-border rounded-md px-3 py-2 text-[13px] font-mono text-text outline-none focus:border-gold/40"
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={local.featured ?? false}
              onChange={(e) => setLocal({ ...local, featured: e.target.checked })}
              className="accent-[#3DD598] w-3 h-3"
            />
            <span className="text-[11px] text-text-muted">Featured (shown with "Most popular" badge)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={local.active}
              onChange={(e) => setLocal({ ...local, active: e.target.checked })}
              className="accent-[#3DD598] w-3 h-3"
            />
            <span className="text-[11px] text-text-muted">Active (visible to investors)</span>
          </label>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border-strong rounded-lg text-[12px] text-text-muted hover:bg-card-elev transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-gold text-gold-dark rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {local._new ? "Create plan" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, vault }: { label: string; value: string; vault?: boolean }) {
  return (
    <div className={cn("flex justify-between text-[10px] py-0.5", vault ? "text-vault-muted" : "text-text-muted")}>
      <span>{label}</span>
      <span className={cn("font-mono", vault ? "text-vault font-medium" : "text-text")}>{value}</span>
    </div>
  );
}

function RowSmall({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={cn("font-mono", valueColor ?? "text-text")}>{value}</span>
    </div>
  );
}
