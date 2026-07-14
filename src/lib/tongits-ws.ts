"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getFirebase } from "./firebase";
import type { Card, TongitsGameState } from "./tongits-game";

const WS_URL = process.env.NEXT_PUBLIC_TONGITS_WS_URL ?? "";

type WsState = "connecting" | "connected" | "closed";

export function useTongitsWs(
  code: string | null,
  uid: string | null,
  onError?: (msg: string) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsState, setWsState] = useState<WsState>("closed");
  const [gs, setGs] = useState<TongitsGameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsState("closed");
  }, []);

  const sendAction = useCallback(
    (msg: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !code) return;
      ws.send(JSON.stringify({ ...msg, code }));
    },
    [code]
  );

  const connect = useCallback(async () => {
    if (!code || !uid || !WS_URL) return;
    cleanup();
    setWsState("connecting");

    const { auth } = getFirebase();
    if (!auth?.currentUser) return;
    const token = await auth.currentUser.getIdToken();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "auth", token, code }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        switch (msg.type) {
          case "auth_ok":
            setWsState("connected");
            break;
          case "auth_error":
            console.error("WS auth error:", msg.error);
            cleanup();
            break;
          case "state":
            setGs(msg.gs);
            break;
          case "hand":
            setHand(msg.cards);
            break;
          case "ended":
            setGs(null);
            break;
          case "error":
            onErrorRef.current?.(msg.error);
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setWsState("closed");
      wsRef.current = null;
      if (codeRef.current === code) {
        reconnectTimer.current = setTimeout(() => connect(), 2000);
      }
    };

    ws.onerror = () => {};
  }, [code, uid, cleanup]);

  useEffect(() => {
    if (code && uid && WS_URL) connect();
    return cleanup;
  }, [code, uid, connect, cleanup]);

  const wsDraw = useCallback(
    async () => { sendAction({ action: "draw" }); },
    [sendAction]
  );
  const wsTakeDiscard = useCallback(
    async (meldCards: Card[]) => { sendAction({ action: "takeDiscard", meldCards }); },
    [sendAction]
  );
  const wsMeld = useCallback(
    async (cards: Card[]) => { sendAction({ action: "meld", cards }); },
    [sendAction]
  );
  const wsSapaw = useCallback(
    async (targetUid: string, meldIndex: number, card: Card) => {
      sendAction({ action: "sapaw", targetUid, meldIndex, card });
    },
    [sendAction]
  );
  const wsDiscard = useCallback(
    async (card: Card) => { sendAction({ action: "discard", card }); },
    [sendAction]
  );
  const wsCall = useCallback(
    async () => { sendAction({ action: "call" }); },
    [sendAction]
  );
  const wsFightRespond = useCallback(
    async (response: "fight" | "fold") => { sendAction({ action: "fightRespond", response }); },
    [sendAction]
  );
  const wsEnforceTimeout = useCallback(
    async () => { sendAction({ action: "enforceTimeout" }); },
    [sendAction]
  );

  return {
    enabled: !!WS_URL,
    connected: wsState === "connected",
    wsState,
    gs,
    hand,
    draw: wsDraw,
    takeDiscard: wsTakeDiscard,
    meld: wsMeld,
    sapaw: wsSapaw,
    discard: wsDiscard,
    call: wsCall,
    fightRespond: wsFightRespond,
    enforceTimeout: wsEnforceTimeout,
  };
}
