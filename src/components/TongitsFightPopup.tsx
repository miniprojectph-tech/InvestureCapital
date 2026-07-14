"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import {
  fightRespond as cfFightRespond,
  enforceTimeout as cfEnforceTimeout,
  type TongitsGameState,
} from "@/lib/tongits-game";

type Props = {
  code: string;
  gs: TongitsGameState;
  wsFightRespond?: (response: "fight" | "fold") => Promise<void>;
  wsActive: boolean;
};

export function TongitsFightPopup({ code, gs, wsFightRespond, wsActive }: Props) {
  const { user } = useAuth();
  const uid = user?.uid;
  const fs = gs.fightState;
  const [busy, setBusy] = useState(false);
  const [msLeft, setMsLeft] = useState(10_000);

  useEffect(() => {
    if (!fs) return;
    const iv = setInterval(() => {
      const remaining = Math.max(0, fs.deadline - Date.now());
      setMsLeft(remaining);
      if (remaining <= 0) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, [fs]);

  const enforceDeadline = useCallback(async () => {
    try { await cfEnforceTimeout(code); } catch { /* another client may resolve */ }
  }, [code]);

  useEffect(() => {
    if (msLeft > 0 || !fs) return;
    enforceDeadline();
  }, [msLeft, fs, enforceDeadline]);

  if (!fs || !uid) return null;

  const myResponse = fs.responses[uid];
  const isCaller = fs.callerUid === uid;
  const callerName = gs.seats.find((s) => s.uid === fs.callerUid)?.name ?? "Player";
  const secondsLeft = Math.ceil(msLeft / 1000);

  async function respond(r: "fight" | "fold") {
    if (busy) return;
    setBusy(true);
    try {
      if (wsActive && wsFightRespond) await wsFightRespond(r);
      else await cfFightRespond(code, r);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "50cqw",
          background: "linear-gradient(180deg, #0f1d35 0%, #162a4a 100%)",
          border: "0.2cqw solid rgba(245,198,107,0.5)",
          borderRadius: "2cqw",
          padding: "2cqw 3cqw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5cqw",
          containerType: "inline-size",
        }}
      >
        {/* Title */}
        <div style={{ fontSize: "2.2cqw", fontWeight: 900, color: "#F5C66B", letterSpacing: "0.1em", textAlign: "center" }}>
          {isCaller ? "YOU CALLED FIGHT!" : `${callerName} CALLED FIGHT!`}
        </div>

        {/* Timer */}
        <div style={{
          width: "6cqw", height: "6cqw", borderRadius: "50%",
          background: `conic-gradient(${secondsLeft <= 3 ? "#e53935" : "#F5C66B"} ${(msLeft / 10000) * 360}deg, rgba(255,255,255,0.1) 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: "4.5cqw", height: "4.5cqw", borderRadius: "50%",
            background: "#0f1d35",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2cqw", fontWeight: 900, color: secondsLeft <= 3 ? "#e53935" : "#fff",
          }}>
            {secondsLeft}
          </div>
        </div>

        {/* Player statuses */}
        <div style={{ display: "flex", gap: "2cqw", justifyContent: "center", flexWrap: "wrap" }}>
          {gs.seats.filter((s) => s.uid !== fs.callerUid).map((s) => {
            const resp = fs.responses[s.uid];
            const label = resp === "fight" ? "FIGHT" : resp === "fold" ? "FOLD" : resp === "burned" ? "BURNED" : "...";
            const color = resp === "fight" ? "#e53935" : resp === "fold" ? "#888" : resp === "burned" ? "#ff6f00" : "rgba(255,255,255,0.4)";
            return (
              <div key={s.uid} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4cqw",
              }}>
                <div style={{
                  width: "5cqw", height: "5cqw", borderRadius: "50%",
                  background: resp ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                  border: `0.2cqw solid ${color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.8cqw", fontWeight: 800, color: "#F5C66B",
                }}>
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: "1cqw", fontWeight: 700, color, letterSpacing: "0.05em" }}>
                  {label}
                </span>
                <span style={{ fontSize: "0.8cqw", color: "rgba(255,255,255,0.5)" }}>{s.name}</span>
              </div>
            );
          })}
        </div>

        {/* Action area */}
        {isCaller ? (
          <div style={{ fontSize: "1.2cqw", color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
            Waiting for responses...
          </div>
        ) : myResponse === "burned" ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5cqw",
          }}>
            <div style={{
              fontSize: "3cqw", fontWeight: 900, color: "#ff6f00",
              textShadow: "0 0 1.5cqw rgba(255,111,0,0.6)",
              animation: "fightBurnPulse 1s ease-in-out infinite alternate",
            }}>
              BURNED
            </div>
            <div style={{ fontSize: "1cqw", color: "rgba(255,255,255,0.5)" }}>
              No exposed melds — you can't fight
            </div>
          </div>
        ) : myResponse !== undefined ? (
          <div style={{
            fontSize: "1.4cqw", fontWeight: 700,
            color: myResponse === "fight" ? "#e53935" : "#888",
          }}>
            You chose {myResponse === "fight" ? "FIGHT" : "FOLD"} — waiting...
          </div>
        ) : (
          <div style={{ display: "flex", gap: "2cqw" }}>
            <button
              onClick={() => respond("fight")}
              disabled={busy}
              style={{
                width: "14cqw", height: "5cqw",
                background: "linear-gradient(180deg, #e53935 0%, #b71c1c 100%)",
                border: "0.15cqw solid rgba(255,255,255,0.3)",
                borderRadius: "1cqw",
                color: "#fff", fontWeight: 900, fontSize: "1.6cqw",
                cursor: "pointer",
                boxShadow: "0 0.4cqw 1.5cqw rgba(229,57,53,0.5)",
                animation: "fightBtnPulse 1.5s ease-in-out infinite",
                letterSpacing: "0.1em",
              }}
            >
              FIGHT
            </button>
            <button
              onClick={() => respond("fold")}
              disabled={busy}
              style={{
                width: "14cqw", height: "5cqw",
                background: "linear-gradient(180deg, #555 0%, #333 100%)",
                border: "0.15cqw solid rgba(255,255,255,0.2)",
                borderRadius: "1cqw",
                color: "#ccc", fontWeight: 900, fontSize: "1.6cqw",
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              FOLD
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fightBtnPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0.4cqw 1.5cqw rgba(229,57,53,0.5); }
          50% { transform: scale(1.04); box-shadow: 0 0.4cqw 2.5cqw rgba(229,57,53,0.7); }
        }
        @keyframes fightBurnPulse {
          0% { opacity: 0.7; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
