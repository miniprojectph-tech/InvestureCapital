"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/Card";
import { Switch } from "@/components/Switch";
import { useAuth } from "@/lib/auth";
import { useStatusHidden, setStatusHidden } from "@/lib/activeStatus";

/** Profile › Privacy: "Show my active status" (on by default). */
export function ActiveStatusCard() {
  const { user, demoMode } = useAuth();
  const uid = user && !demoMode ? user.uid : null;
  const hidden = useStatusHidden(uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(show: boolean) {
    if (!uid) return;
    setBusy(true); setError(null);
    try { await setStatusHidden(uid, !show); }
    catch { setError("Could not save. Please try again."); }
    finally { setBusy(false); }
  }

  if (!uid) return null;
  return (
    <Card>
      <CardHeader title="Privacy" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-text m-0">Show my active status</p>
          <p className="text-[10px] text-text-subtle m-0 mt-0.5">The team and your Team Leader can see when you&apos;re active. Turn off to hide it.</p>
        </div>
        <Switch checked={hidden === false} onChange={toggle} disabled={busy || hidden === null} label="Show my active status" />
      </div>
      {error && <p className="text-[10px] text-red m-0 mt-2">{error}</p>}
    </Card>
  );
}
