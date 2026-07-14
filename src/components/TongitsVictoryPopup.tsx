"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { seatedPlayers, type TongitsRoom } from "@/lib/tongits";
import { postGameRespond, resolvePostGame, startGame, cardLabel, isRedSuit, type Card } from "@/lib/tongits-game";
import { useTongitsAssets } from "@/lib/tongitsAssets";

const RESULT_LABEL: Record<string, string> = {
  tongits_win: "Tongits!",
  draw_win: "Draw — stock ran out",
  lowest_points_win: "Lowest hand wins",
};

const POST_GAME_MS = 15_000;
const SHOWDOWN_MS = 5_000;

const SHOWDOWN_TYPES = new Set(["draw_win", "lowest_points_win"]);

function ShowdownCard({ card }: { card: Card }) {
  const red = isRedSuit(card);
  return (
    <div
      style={{
        width: "3.2cqw",
        height: "4.5cqw",
        borderRadius: "0.45cqw",
        background: "#fff",
        color: red ? "#d1341c" : "#101423",
        border: "0.1cqw solid #d9d9d9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: "1.15cqw",
        fontFamily: "system-ui",
        boxShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.3)",
        flexShrink: 0,
      }}
    >
      {cardLabel(card)}
    </div>
  );
}

function ShowdownOverlay({
  room,
  onDone,
}: {
  room: TongitsRoom;
  onDone: () => void;
}) {
  const r = room.lastResult!;
  const seats = seatedPlayers(room);
  const hands = r.hands ?? {};
  const [countdown, setCountdown] = useState(Math.ceil(SHOWDOWN_MS / 1000));

  useEffect(() => {
    const timer = setTimeout(onDone, SHOWDOWN_MS);
    const tick = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => { clearTimeout(timer); clearInterval(tick); };
  }, [onDone]);

  const fr = r.fightResponses;
  const sorted = [...seats].sort(
    (a, b) => (r.values[a.uid] ?? 999) - (r.values[b.uid] ?? 999)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        style={{
          width: "min(94vw, calc(94dvh * 1774 / 887))",
          aspectRatio: "1774 / 887",
          containerType: "inline-size",
          position: "relative",
          background: "linear-gradient(180deg, #0a1c30 0%, #0e2848 40%, #122e50 100%)",
          borderRadius: "1.5cqw",
          border: "0.2cqw solid rgba(245,198,107,0.4)",
          overflow: "hidden",
          boxShadow: "0 0 60px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "3%",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#F5C66B",
            fontWeight: 900,
            fontSize: "2.8cqw",
            letterSpacing: "0.12em",
            textShadow: "0 0.2cqw 0.5cqw rgba(0,0,0,0.5)",
            textAlign: "center",
          }}
        >
          SHOWDOWN
        </div>
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.6)",
            fontWeight: 600,
            fontSize: "1.3cqw",
          }}
        >
          {r.resultType === "draw_win" ? "Stock is empty — comparing hands" : "Fight called — comparing hands"}
        </div>

        <div
          style={{
            position: "absolute",
            top: "3%",
            right: "4%",
            background: "rgba(245,198,107,0.15)",
            border: "0.12cqw solid rgba(245,198,107,0.5)",
            borderRadius: "0.6cqw",
            padding: "0.3cqw 0.9cqw",
            color: "#F5C66B",
            fontWeight: 900,
            fontSize: "1.8cqw",
            fontFamily: "monospace",
          }}
        >
          {countdown}s
        </div>

        {sorted.map((s, idx) => {
          const isWinner = s.uid === r.winnerUserId;
          const hand = hands[s.uid] ?? [];
          const points = r.values[s.uid] ?? 0;
          const y = 18 + idx * 28;
          const fightResp = fr?.[s.uid];
          const didFold = fightResp === "fold" || fightResp === "burned";

          return (
            <div
              key={s.uid}
              style={{
                position: "absolute",
                left: "4%",
                right: "4%",
                top: `${y}%`,
                height: "24%",
                background: isWinner
                  ? "linear-gradient(135deg, rgba(75,212,122,0.15), rgba(75,212,122,0.05))"
                  : "rgba(255,255,255,0.03)",
                border: isWinner
                  ? "0.15cqw solid rgba(75,212,122,0.5)"
                  : "0.1cqw solid rgba(255,255,255,0.1)",
                borderRadius: "1cqw",
                display: "flex",
                alignItems: "center",
                padding: "0 2%",
                gap: "1.5cqw",
              }}
            >
              <div
                style={{
                  width: "5cqw",
                  height: "5cqw",
                  borderRadius: "50%",
                  background: isWinner
                    ? "linear-gradient(135deg, #4bd47a, #2ea655)"
                    : "rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isWinner ? "#fff" : "rgba(255,255,255,0.7)",
                  fontWeight: 900,
                  fontSize: "1.8cqw",
                  flexShrink: 0,
                }}
              >
                {initials(s.name)}
              </div>

              <div style={{ flexShrink: 0, minWidth: "10cqw" }}>
                <div
                  style={{
                    color: isWinner ? "#4bd47a" : "#fff",
                    fontWeight: 800,
                    fontSize: "1.6cqw",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "12cqw",
                  }}
                >
                  {s.name}
                </div>
                {isWinner && (
                  <div style={{ color: "#F5C66B", fontWeight: 700, fontSize: "1cqw", marginTop: "0.2cqw" }}>
                    WINNER
                  </div>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.3cqw",
                  justifyContent: "center",
                  overflow: "hidden",
                  opacity: didFold ? 0.35 : 1,
                }}
              >
                {didFold ? (
                  <span style={{
                    color: fightResp === "burned" ? "#ff6f00" : "#888",
                    fontWeight: 800,
                    fontSize: "1.8cqw",
                    letterSpacing: "0.1em",
                  }}>
                    {fightResp === "burned" ? "BURNED" : "FOLDED"}
                  </span>
                ) : hand.map((c) => (
                  <ShowdownCard key={c} card={c} />
                ))}
              </div>

              <div
                style={{
                  flexShrink: 0,
                  textAlign: "right",
                  minWidth: "7cqw",
                }}
              >
                <div
                  style={{
                    color: didFold ? "#888" : isWinner ? "#4bd47a" : "#ef4444",
                    fontWeight: 900,
                    fontSize: "2.8cqw",
                    fontFamily: "monospace",
                    lineHeight: 1,
                  }}
                >
                  {didFold ? "—" : points}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontWeight: 600,
                    fontSize: "1cqw",
                    marginTop: "0.2cqw",
                  }}
                >
                  {didFold ? (fightResp === "burned" ? "NO MELDS" : "SAFE") : "POINTS"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S = {
  winnerAvatar: { l: 22, t: 30, w: 14, h: 22 },
  winnerName: { l: 42, t: 30, w: 28, h: 9 },
  winnerPoints: { l: 42, t: 46, w: 28, h: 8 },
  ru1Row: { l: 22, t: 59, w: 44, h: 9 },
  ru2Row: { l: 22, t: 70, w: 44, h: 9 },
  continueBtn: { l: 20, t: 87, w: 24, h: 10 },
  timerBadge: { l: 47, t: 87, w: 6, h: 10 },
  quitBtn: { l: 56, t: 87, w: 24, h: 10 },
  resultLabel: { l: 30, t: 21, w: 40, h: 5 },
  statusRow: { l: 20, t: 80, w: 60, h: 5 },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type Box = { l: number; t: number; w: number; h: number };
function Slot({ box, children, style }: { box: Box; children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${box.l}%`,
        top: `${box.t}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function TongitsVictoryPopup({ code, room }: { code: string; room: TongitsRoom }) {
  const { user } = useAuth();
  const assets = useTongitsAssets();
  const [busy, setBusy] = useState<string | null>(null);
  const [msLeft, setMsLeft] = useState(POST_GAME_MS);
  const [resolved, setResolved] = useState(false);

  const r = room.lastResult!;
  const hasHands = r.hands && Object.keys(r.hands).length > 0;
  const isShowdownType = SHOWDOWN_TYPES.has(r.resultType);
  const [showingShowdown, setShowingShowdown] = useState(isShowdownType && !!hasHands);

  const responses = room.postGameResponses ?? {};
  const myResponse = user ? responses[user.uid] : undefined;
  const seats = seatedPlayers(room);
  const allResponded = seats.every((s) => responses[s.uid]);

  const doResolve = useCallback(async () => {
    if (resolved) return;
    setResolved(true);
    try {
      const res = await resolvePostGame(code);
      if (res.needsStart) {
        try { await startGame(code); } catch { /* another client may start it first */ }
      }
    } catch { /* room state will reflect the outcome */ }
  }, [code, resolved]);

  useEffect(() => {
    if (showingShowdown) return;
    if (allResponded) {
      void doResolve();
      return;
    }
    const deadline = room.postGameDeadline ?? (Date.now() + POST_GAME_MS);
    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setMsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        void doResolve();
      }
    }, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingShowdown, allResponded]);

  if (showingShowdown) {
    return <ShowdownOverlay room={room} onDone={() => setShowingShowdown(false)} />;
  }

  const C = room.challengePoints;
  const winner = seats.find((s) => s.uid === r.winnerUserId);
  const losers = seats.filter((s) => s.uid !== r.winnerUserId);
  const iAmWinner = user?.uid === r.winnerUserId;
  const fr = r.fightResponses;
  const fighterCount = fr ? seats.filter((s) => fr[s.uid] === "fight").length : seats.length;
  const winnerPayout = C * fighterCount + r.jackpotWon;

  async function onContinue() {
    setBusy("continue");
    try {
      await postGameRespond(code, "continue");
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }
  async function onQuit() {
    setBusy("quit");
    try {
      await postGameRespond(code, "quit");
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }

  const secondsLeft = Math.ceil(msLeft / 1000);
  const hasResponded = !!myResponse;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative"
        style={{
          width: "min(94vw, calc(94dvh * 1672 / 941))",
          aspectRatio: "1672 / 941",
          containerType: "inline-size",
        }}
      >
        <img
          src={assets.victoryPopup}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />

        {!iAmWinner && (
          <Slot box={S.resultLabel}>
            <span
              style={{
                color: "#fff5d8",
                background: "#8f1d2a",
                fontWeight: 800,
                fontSize: "1.3cqw",
                letterSpacing: "0.08em",
                padding: "0.4cqw 1.2cqw",
                borderRadius: "0.5cqw",
              }}
            >
              {RESULT_LABEL[r.resultType] ?? r.resultType}
            </span>
          </Slot>
        )}

        <Slot box={S.winnerAvatar}>
          <span style={{ color: "#F5C66B", fontWeight: 900, fontSize: "2.8cqw", textShadow: "0 0.1cqw 0.3cqw rgba(0,0,0,0.3)" }}>
            {winner ? initials(winner.name) : "?"}
          </span>
        </Slot>

        <Slot box={S.winnerName} style={{ justifyContent: "flex-start" }}>
          <span
            style={{
              color: "#3d2a0a",
              fontWeight: 900,
              fontSize: "2.4cqw",
              letterSpacing: "0.03em",
              maxWidth: "100%",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textShadow: "0 0.05cqw 0 rgba(255,255,255,0.4)",
            }}
          >
            {winner?.name ?? "Winner"}
          </span>
        </Slot>

        <Slot box={S.winnerPoints}>
          <span
            style={{
              color: "#F5C66B",
              fontWeight: 900,
              fontSize: "2.2cqw",
              letterSpacing: "0.06em",
              textShadow: "0 0.1cqw 0.2cqw rgba(0,0,0,0.5)",
            }}
          >
            +{winnerPayout.toLocaleString()} GP
          </span>
        </Slot>

        {losers.slice(0, 2).map((loser, idx) => {
          const rowBox = idx === 0 ? S.ru1Row : S.ru2Row;
          const resp = fr?.[loser.uid];
          const isMe = user?.uid === loser.uid;
          return (
            <Slot key={loser.uid} box={rowBox} style={{ justifyContent: "flex-start", gap: "1cqw" }}>
              <div style={{
                width: "3.5cqw", height: "3.5cqw", borderRadius: "50%",
                background: idx === 0 ? "linear-gradient(135deg, #8f1d2a, #c0392b)" : "linear-gradient(135deg, #27774a, #2ea655)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                border: "0.15cqw solid rgba(255,255,255,0.3)",
              }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.2cqw" }}>
                  {initials(loser.name)}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  color: "#4a2f0d",
                  fontWeight: 800,
                  fontSize: "1.5cqw",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {loser.name}
                  {isMe && <span style={{ color: "#8f1d2a", fontWeight: 700 }}> · you</span>}
                </span>
                <span style={{
                  flexShrink: 0,
                  fontWeight: 900,
                  fontSize: resp === "fold" || resp === "burned" ? "1.3cqw" : "1.5cqw",
                  color: resp === "fold" ? "#777" : resp === "burned" ? "#d35400" : "#8f1d2a",
                  letterSpacing: "0.04em",
                  paddingLeft: "0.5cqw",
                }}>
                  {resp === "fold" ? "FOLDED" : resp === "burned" ? "BURNED" : `−${C} GP`}
                </span>
              </div>
            </Slot>
          );
        })}

        {/* Player response status indicators */}
        <Slot box={S.statusRow} style={{ gap: "1.5cqw" }}>
          {seats.map((s) => {
            const resp = responses[s.uid];
            return (
              <div
                key={s.uid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4cqw",
                }}
              >
                <div
                  style={{
                    width: "1.2cqw",
                    height: "1.2cqw",
                    borderRadius: "50%",
                    background: resp === "continue"
                      ? "#4bd47a"
                      : resp === "quit"
                      ? "#ef4444"
                      : "rgba(255,255,255,0.3)",
                    border: "0.1cqw solid rgba(255,255,255,0.2)",
                  }}
                />
                <span
                  style={{
                    color: resp ? "#fff" : "rgba(255,255,255,0.5)",
                    fontWeight: 700,
                    fontSize: "0.9cqw",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </Slot>

        {/* Buttons: show action buttons if not responded, "Waiting..." if responded */}
        {hasResponded ? (
          <Slot box={{ l: 20, t: 87, w: 60, h: 10 }}>
            <span
              style={{
                color: "#F5C66B",
                fontWeight: 800,
                fontSize: "1.4cqw",
                letterSpacing: "0.06em",
              }}
            >
              {myResponse === "continue" ? "Waiting for others..." : "Leaving..."}
            </span>
          </Slot>
        ) : (
          <>
            <button
              onClick={onContinue}
              disabled={!!busy}
              style={{
                position: "absolute",
                left: `${S.continueBtn.l}%`,
                top: `${S.continueBtn.t}%`,
                width: `${S.continueBtn.w}%`,
                height: `${S.continueBtn.h}%`,
                background: "transparent",
                border: "none",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 900,
                color: "transparent",
              }}
              aria-label="Continue"
            >
              {busy === "continue" && <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#4a2f0d]" />}
            </button>

            <Slot box={S.timerBadge}>
              <span
                style={{
                  color: "#F5C66B",
                  fontWeight: 900,
                  fontSize: "2.4cqw",
                  fontFamily: "monospace",
                  textShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.5)",
                }}
              >
                {secondsLeft}
              </span>
            </Slot>

            <button
              onClick={onQuit}
              disabled={!!busy}
              style={{
                position: "absolute",
                left: `${S.quitBtn.l}%`,
                top: `${S.quitBtn.t}%`,
                width: `${S.quitBtn.w}%`,
                height: `${S.quitBtn.h}%`,
                background: "transparent",
                border: "none",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 900,
                color: "transparent",
              }}
              aria-label="Quit"
            >
              {busy === "quit" && <Loader2 className="w-6 h-6 mx-auto animate-spin text-white" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
