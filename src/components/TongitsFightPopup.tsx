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
  const [entered, setEntered] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setEntered(true)); }, []);

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
  const callerSeat = gs.seats.find((s) => s.uid === fs.callerUid);
  const callerName = callerSeat?.name ?? "Player";
  const secondsLeft = Math.ceil(msLeft / 1000);
  const timerFrac = msLeft / 10000;

  async function respond(r: "fight" | "fold") {
    if (busy) return;
    setBusy(true);
    try {
      if (wsActive && wsFightRespond) await wsFightRespond(r);
      else await cfFightRespond(code, r);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const opponents = gs.seats.filter((s) => s.uid !== fs.callerUid);
  const isBurned = myResponse === "burned";
  const hasResponded = myResponse !== undefined;
  const showButtons = !isCaller && !hasResponded && !isBurned;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        overflow: "hidden",
        opacity: entered ? 1 : 0,
        transition: "opacity 0.3s ease-out",
      }}
    >
      {/* Darkened backdrop */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
      }} />

      {/* Split screen container */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>

        {/* "FIGHT!!" banner at top */}
        <div style={{
          fontSize: "5cqw",
          fontWeight: 900,
          fontStyle: "italic",
          color: "#fff",
          textShadow: "0 0 2cqw rgba(229,57,53,0.8), 0 0 4cqw rgba(229,57,53,0.4), 0 0.3cqw 0 #000",
          letterSpacing: "0.15em",
          animation: "fightTitleSlam 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          zIndex: 2,
          marginBottom: "-1cqw",
        }}>
          FIGHT!!
        </div>

        {/* Caller info badge */}
        <div style={{
          fontSize: "1.4cqw",
          fontWeight: 700,
          color: "#F5C66B",
          textShadow: "0 0.1cqw 0.3cqw rgba(0,0,0,0.8)",
          zIndex: 2,
          marginBottom: "1.5cqw",
          animation: "fightFadeUp 0.6s 0.3s ease-out both",
        }}>
          {isCaller ? "You called the fight!" : `${callerName} called the fight!`}
        </div>

        {/* Main split panel */}
        <div style={{
          width: "70cqw",
          height: "32cqw",
          position: "relative",
          borderRadius: "2cqw",
          overflow: "hidden",
          boxShadow: "0 0.5cqw 3cqw rgba(0,0,0,0.6), 0 0 2cqw rgba(229,57,53,0.3)",
          animation: "fightPanelPop 0.4s 0.15s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>

          {/* Diagonal split - FIGHT side (left/red) */}
          <div style={{
            position: "absolute", inset: 0,
            clipPath: "polygon(0 0, 65% 0, 35% 100%, 0 100%)",
            background: "linear-gradient(135deg, #c62828 0%, #e53935 40%, #ff5252 100%)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "repeating-linear-gradient(45deg, transparent, transparent 2cqw, rgba(255,255,255,0.03) 2cqw, rgba(255,255,255,0.03) 4cqw)",
            }} />
            {/* Lightning bolts decorative */}
            <svg viewBox="0 0 100 100" style={{
              position: "absolute", left: "2%", top: "10%",
              width: "20cqw", height: "20cqw", opacity: 0.15,
            }}>
              <polygon points="45,0 25,45 40,45 20,100 80,40 55,40 75,0" fill="#fff" />
            </svg>

            {showButtons ? (
              <button
                onClick={() => respond("fight")}
                disabled={busy}
                style={{
                  position: "absolute",
                  left: "3cqw", top: "50%", transform: "translateY(-50%)",
                  width: "25cqw", height: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: "1cqw",
                }}
              >
                {/* Boxing glove emoji */}
                <div style={{ fontSize: "5cqw", filter: "drop-shadow(0 0.2cqw 0.5cqw rgba(0,0,0,0.5))" }}>
                  &#x1F94A;
                </div>
                <div style={{
                  fontSize: "3.5cqw", fontWeight: 900, fontStyle: "italic",
                  color: "#fff",
                  textShadow: "0 0.2cqw 0 rgba(0,0,0,0.5), 0 0 1cqw rgba(255,255,255,0.3)",
                  letterSpacing: "0.1em",
                  animation: "fightTextPulse 1.5s ease-in-out infinite",
                }}>
                  CHALLENGE
                </div>
              </button>
            ) : (
              <div style={{
                position: "absolute",
                left: "3cqw", top: "50%", transform: "translateY(-50%)",
                width: "25cqw",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: "1cqw",
              }}>
                <div style={{ fontSize: "5cqw", filter: "drop-shadow(0 0.2cqw 0.5cqw rgba(0,0,0,0.5))" }}>
                  &#x1F94A;
                </div>
                <div style={{
                  fontSize: "3.5cqw", fontWeight: 900, fontStyle: "italic",
                  color: "#fff",
                  textShadow: "0 0.2cqw 0 rgba(0,0,0,0.5)",
                  letterSpacing: "0.1em",
                  opacity: hasResponded && myResponse === "fight" ? 1 : 0.4,
                }}>
                  CHALLENGE
                </div>
              </div>
            )}
          </div>

          {/* Diagonal split - FOLD side (right/dark) */}
          <div style={{
            position: "absolute", inset: 0,
            clipPath: "polygon(65% 0, 100% 0, 100% 100%, 35% 100%)",
            background: "linear-gradient(135deg, #37474f 0%, #455a64 40%, #546e7a 100%)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "repeating-linear-gradient(-45deg, transparent, transparent 2cqw, rgba(0,0,0,0.05) 2cqw, rgba(0,0,0,0.05) 4cqw)",
            }} />
            {/* White flag decorative */}
            <svg viewBox="0 0 100 100" style={{
              position: "absolute", right: "5%", top: "15%",
              width: "14cqw", height: "14cqw", opacity: 0.12,
            }}>
              <rect x="15" y="10" width="5" height="80" rx="2" fill="#fff" />
              <path d="M20,10 Q60,5 55,30 Q50,55 20,45 Z" fill="#fff" />
            </svg>

            {showButtons ? (
              <button
                onClick={() => respond("fold")}
                disabled={busy}
                style={{
                  position: "absolute",
                  right: "3cqw", top: "50%", transform: "translateY(-50%)",
                  width: "25cqw", height: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: "1cqw",
                }}
              >
                <div style={{ fontSize: "5cqw", filter: "drop-shadow(0 0.2cqw 0.5cqw rgba(0,0,0,0.5))" }}>
                  &#x1F3F3;&#xFE0F;
                </div>
                <div style={{
                  fontSize: "3.5cqw", fontWeight: 900, fontStyle: "italic",
                  color: "rgba(255,255,255,0.85)",
                  textShadow: "0 0.2cqw 0 rgba(0,0,0,0.5)",
                  letterSpacing: "0.1em",
                }}>
                  FOLD
                </div>
              </button>
            ) : (
              <div style={{
                position: "absolute",
                right: "3cqw", top: "50%", transform: "translateY(-50%)",
                width: "25cqw",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: "1cqw",
              }}>
                <div style={{ fontSize: "5cqw", filter: "drop-shadow(0 0.2cqw 0.5cqw rgba(0,0,0,0.5))" }}>
                  &#x1F3F3;&#xFE0F;
                </div>
                <div style={{
                  fontSize: "3.5cqw", fontWeight: 900, fontStyle: "italic",
                  color: "rgba(255,255,255,0.85)",
                  textShadow: "0 0.2cqw 0 rgba(0,0,0,0.5)",
                  letterSpacing: "0.1em",
                  opacity: hasResponded && myResponse === "fold" ? 1 : 0.4,
                }}>
                  FOLD
                </div>
              </div>
            )}
          </div>

          {/* Center diagonal divider line */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom right, transparent calc(50% - 0.15cqw), #F5C66B calc(50% - 0.15cqw), #F5C66B calc(50% + 0.15cqw), transparent calc(50% + 0.15cqw))",
            pointerEvents: "none",
            zIndex: 1,
          }} />

          {/* Center timer circle */}
          <div style={{
            position: "absolute",
            left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2,
          }}>
            <div style={{
              width: "8cqw", height: "8cqw",
              borderRadius: "50%",
              background: `conic-gradient(${secondsLeft <= 3 ? "#e53935" : "#F5C66B"} ${timerFrac * 360}deg, rgba(0,0,0,0.6) 0deg)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 1.5cqw rgba(0,0,0,0.8), 0 0 3cqw rgba(245,198,107,0.3)",
            }}>
              <div style={{
                width: "6cqw", height: "6cqw",
                borderRadius: "50%",
                background: "radial-gradient(circle, #1a2a44 0%, #0d1929 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column",
              }}>
                <div style={{
                  fontSize: "2.8cqw", fontWeight: 900,
                  color: secondsLeft <= 3 ? "#e53935" : "#fff",
                  lineHeight: 1,
                }}>
                  {secondsLeft}
                </div>
                <div style={{ fontSize: "0.7cqw", color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "0.1em" }}>
                  SEC
                </div>
              </div>
            </div>
          </div>

          {/* VS badge */}
          {showButtons && (
            <div style={{
              position: "absolute",
              left: "50%", top: "15%",
              transform: "translateX(-50%)",
              fontSize: "2cqw", fontWeight: 900,
              color: "#F5C66B",
              textShadow: "0 0 0.8cqw rgba(245,198,107,0.6), 0 0.15cqw 0 #000",
              letterSpacing: "0.2em",
              zIndex: 2,
            }}>
              VS
            </div>
          )}
        </div>

        {/* Player response statuses below the panel */}
        <div style={{
          display: "flex",
          gap: "3cqw",
          marginTop: "2cqw",
          animation: "fightFadeUp 0.5s 0.5s ease-out both",
        }}>
          {opponents.map((s) => {
            const resp = fs.responses[s.uid];
            const label = resp === "fight" ? "CHALLENGE!" : resp === "fold" ? "FOLDED" : resp === "burned" ? "BURNED" : "Deciding...";
            const bg = resp === "fight"
              ? "rgba(229,57,53,0.25)" : resp === "fold"
              ? "rgba(255,255,255,0.08)" : resp === "burned"
              ? "rgba(255,111,0,0.2)" : "rgba(255,255,255,0.05)";
            const borderColor = resp === "fight"
              ? "#e53935" : resp === "fold"
              ? "rgba(255,255,255,0.2)" : resp === "burned"
              ? "#ff6f00" : "rgba(255,255,255,0.15)";
            const textColor = resp === "fight"
              ? "#ff5252" : resp === "fold"
              ? "rgba(255,255,255,0.5)" : resp === "burned"
              ? "#ff9800" : "rgba(255,255,255,0.4)";

            return (
              <div key={s.uid} style={{
                display: "flex", alignItems: "center", gap: "1cqw",
                background: bg,
                border: `0.15cqw solid ${borderColor}`,
                borderRadius: "1cqw",
                padding: "0.6cqw 1.5cqw",
              }}>
                <div style={{
                  width: "3cqw", height: "3cqw", borderRadius: "50%",
                  background: "rgba(255,255,255,0.1)",
                  border: `0.15cqw solid ${borderColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.2cqw", fontWeight: 800, color: "#F5C66B",
                }}>
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.1cqw" }}>
                  <div style={{ fontSize: "0.9cqw", color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                    {s.name}
                  </div>
                  <div style={{
                    fontSize: "1cqw", fontWeight: 800, color: textColor,
                    letterSpacing: "0.05em",
                    animation: !resp ? "fightDotPulse 1.5s ease-in-out infinite" : undefined,
                  }}>
                    {label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status text for caller / burned / already responded */}
        {(isCaller || isBurned || hasResponded) && (
          <div style={{
            marginTop: "1cqw",
            fontSize: "1.2cqw",
            fontWeight: 700,
            color: isBurned ? "#ff9800" : "rgba(255,255,255,0.5)",
            textAlign: "center",
            animation: "fightFadeUp 0.5s 0.6s ease-out both",
          }}>
            {isCaller
              ? "Waiting for opponents to respond..."
              : isBurned
              ? "You have no exposed melds — BURNED!"
              : myResponse === "fight"
              ? "You accepted the challenge!"
              : "You folded — your stake is safe."}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fightTitleSlam {
          0% { transform: scale(3) rotate(-5deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes fightPanelPop {
          0% { transform: scale(0.7); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fightFadeUp {
          0% { transform: translateY(1cqw); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fightTextPulse {
          0%, 100% { transform: scale(1); text-shadow: 0 0.2cqw 0 rgba(0,0,0,0.5), 0 0 1cqw rgba(255,255,255,0.3); }
          50% { transform: scale(1.06); text-shadow: 0 0.2cqw 0 rgba(0,0,0,0.5), 0 0 2cqw rgba(255,255,255,0.5); }
        }
        @keyframes fightDotPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
