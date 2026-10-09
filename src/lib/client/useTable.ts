"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ActionInput } from "@/lib/poker/types";
import type { PreAction } from "@/lib/protocol/messages";
import { GameConnection } from "./gameConnection";

/** Connects to the game server and follows one table. All game rules stay on the server. */
export function useTable(tableId: string) {
  const [conn] = useState(() => new GameConnection());
  const state = useSyncExternalStore(conn.subscribe, conn.getState, conn.getState);

  useEffect(() => {
    conn.watch(tableId);
    conn.start();
    return () => {
      conn.unwatch(tableId);
      conn.stop();
    };
  }, [conn, tableId]);

  const view = state.views[tableId] ?? null;

  const commands = useMemo(() => {
    const send = (msg: Parameters<GameConnection["send"]>[0]) => {
      if (!conn.send(msg)) conn.fail("Not connected. Reconnecting…");
    };
    return {
      act(handNo: number, action: ActionInput) {
        send({ t: "act", tableId, handNo, actionId: crypto.randomUUID(), action });
      },
      preAction(value: PreAction | null) {
        send({ t: "pre_action", tableId, value });
      },
      sitIn() {
        send({ t: "sit_in", tableId });
      },
      takeSeat() {
        send({ t: "take_seat", tableId });
      },
      leaveSeat() {
        send({ t: "leave_seat", tableId });
      },
    };
  }, [conn, tableId]);

  return { view, status: state.status, userId: state.userId, clockOffset: state.clockOffset, lastError: state.lastError, ...commands };
}

/** Current time (ms), ticking while `active`. */
export function useNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
