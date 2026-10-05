"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, Lock, Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { TopHeader } from "@/components/TopHeader";
import { Card, CardHeader } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { useSettings, saveSettings } from "@/lib/settings";
import { investorNav, currentMenuLayout, applyMenuLayout, menuFromStored, menuToStored, MENU_LOCKED, MENU_GROUP_NAMES, type MenuLayout } from "@/lib/nav";

const LABEL = new Map(investorNav.flatMap((g) => g.items.map((i) => [i.href, i.label] as const)));
const same = (a: MenuLayout, b: MenuLayout) => JSON.stringify(a) === JSON.stringify(b);

/** Admin: arrange the member menu — order, which group each page sits in, and what is hidden. */
export default function AdminMenuPage() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();
  const saved = useMemo(() => currentMenuLayout(investorNav, menuFromStored(settings.menu)), [settings.menu]);
  const [draft, setDraft] = useState<MenuLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Shows what is saved until the admin starts editing.
  const layout = draft ?? saved;
  const dirty = !!draft && !same(draft, saved);
  const builtIn = useMemo(() => currentMenuLayout(investorNav, null), []);
  const hidden = new Set(layout.hidden);

  const edit = (next: MenuLayout) => { setDraft(next); setMsg(null); };

  function move(gi: number, i: number, dir: -1 | 1) {
    const groups = layout.groups.map((g) => [...g]);
    const j = i + dir;
    if (j < 0 || j >= groups[gi].length) return;
    [groups[gi][i], groups[gi][j]] = [groups[gi][j], groups[gi][i]];
    edit({ ...layout, groups });
  }
  function moveToGroup(gi: number, i: number, target: number) {
    if (target === gi) return;
    const groups = layout.groups.map((g) => [...g]);
    const [href] = groups[gi].splice(i, 1);
    groups[target].push(href);
    edit({ ...layout, groups });
  }
  function toggleHidden(href: string) {
    if (MENU_LOCKED.includes(href)) return;
    edit({ ...layout, hidden: hidden.has(href) ? layout.hidden.filter((h) => h !== href) : [...layout.hidden, href] });
  }

  async function save(next: MenuLayout) {
    const { db } = getFirebase();
    if (!db || !user) return;
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings(db, { menu: menuToStored(next) }, user.uid);
      setDraft(null);
      setMsg({ ok: true, text: "Saved. Members see the new menu straight away." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const preview = applyMenuLayout(investorNav, layout);

  return (
    <div>
      <TopHeader title="Member menu" subtitle="Arrange the icons members see in their menu" />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => save(layout)} disabled={!dirty || saving} className="px-3.5 py-2 rounded-lg bg-gold text-gold-dark text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {dirty ? "Save menu" : "Saved"}
        </button>
        {dirty && <button onClick={() => { setDraft(null); setMsg(null); }} className="text-[11px] text-text-muted hover:text-text">Discard changes</button>}
        <button onClick={() => edit(builtIn)} disabled={same(layout, builtIn)} className="ml-auto text-[11px] text-text-muted hover:text-text flex items-center gap-1.5 disabled:opacity-40">
          <RotateCcw className="w-3 h-3" /> Back to the original order
        </button>
      </div>
      {msg && (
        <p className={cn("text-[11px] m-0 mb-3 flex items-center gap-1.5", msg.ok ? "text-green" : "text-red")}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />} {msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 items-start">
        <div className="flex flex-col gap-3">
          {loading && <p className="text-[11px] text-text-subtle m-0">Loading…</p>}
          {layout.groups.map((items, gi) => (
            <Card key={gi}>
              <CardHeader title={MENU_GROUP_NAMES[gi] ?? `Group ${gi + 1}`} subtitle={`${items.filter((h) => !hidden.has(h)).length} shown${items.some((h) => hidden.has(h)) ? ` · ${items.filter((h) => hidden.has(h)).length} hidden` : ""}`} />
              {items.length === 0 && <p className="text-[11px] text-text-subtle m-0">Nothing in this group. Move a page here with its “Group” menu.</p>}
              <div className="flex flex-col">
                {items.map((href, i) => {
                  const isHidden = hidden.has(href);
                  const locked = MENU_LOCKED.includes(href);
                  return (
                    <div key={href} className={cn("flex items-center gap-2 py-2", i < items.length - 1 && "border-b border-border")}>
                      <span className="w-5 text-[10px] font-mono text-text-subtle text-right">{i + 1}</span>
                      <span className={cn("flex-1 min-w-0 text-[12px] truncate", isHidden && "text-text-subtle line-through")}>{LABEL.get(href) ?? href}</span>
                      <select
                        value={gi}
                        onChange={(e) => moveToGroup(gi, i, Number(e.target.value))}
                        aria-label={`Group for ${LABEL.get(href) ?? href}`}
                        className="bg-canvas border border-border rounded-md px-1.5 py-1 text-[10px] text-text-muted outline-none"
                      >
                        {layout.groups.map((_, g) => <option key={g} value={g}>{MENU_GROUP_NAMES[g] ?? `Group ${g + 1}`}</option>)}
                      </select>
                      <button onClick={() => move(gi, i, -1)} disabled={i === 0} aria-label="Move up" className="w-7 h-7 rounded-md border border-border text-text-muted hover:text-text disabled:opacity-30 flex items-center justify-center"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => move(gi, i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="w-7 h-7 rounded-md border border-border text-text-muted hover:text-text disabled:opacity-30 flex items-center justify-center"><ArrowDown className="w-3.5 h-3.5" /></button>
                      {locked ? (
                        <span title="Always shown" className="w-[74px] text-[10px] text-text-subtle flex items-center justify-center gap-1"><Lock className="w-3 h-3" /> Always</span>
                      ) : (
                        <button onClick={() => toggleHidden(href)} className={cn("w-[74px] py-1 rounded-md border text-[10px] flex items-center justify-center gap-1", isHidden ? "border-border text-text-subtle" : "border-green/40 bg-green/10 text-green")}>
                          {isHidden ? <><EyeOff className="w-3 h-3" /> Hidden</> : <><Eye className="w-3 h-3" /> Shown</>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          <p className="text-[10px] text-text-subtle m-0 leading-relaxed max-w-2xl">
            Hiding a page only removes its icon from the menu. The page still opens from a link or a button elsewhere in the app, so hide a
            feature here when you want it out of sight, not when it must be switched off. Dashboard and Profile are always shown.
          </p>
        </div>

        {/* preview */}
        <div className="lg:sticky lg:top-4">
          <p className="text-[10px] uppercase tracking-wider text-text-subtle m-0 mb-1.5">What members see</p>
          <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-3">
            {preview.map((g, gi) => g.items.length > 0 && (
              <div key={gi}>
                <p className="text-[12px] font-medium m-0 mb-2">{MENU_GROUP_NAMES[gi] ?? ""}</p>
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map((it) => (
                    <div key={it.href} className="flex flex-col items-center gap-1.5 py-1">
                      <span className="w-9 h-9 rounded-full bg-canvas border border-border" />
                      <span className="text-[9px] text-text-muted text-center leading-tight">{it.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
