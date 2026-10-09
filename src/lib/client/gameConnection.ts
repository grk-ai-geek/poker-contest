"use client";

import type { ClientMessage, ClientTableView, ServerMessage } from "@/lib/protocol/messages";

// One WebSocket to the game server per browser tab (design.md §10.4).
// Fetches a fresh game token on every (re)connect, re-subscribes to watched tables,
// and reconnects with backoff. React reads it through useSyncExternalStore.

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "replaced";

export type ConnectionState = {
  status: ConnectionStatus;
  userId: string | null;
  views: Record<string, ClientTableView>;
  /** serverTime − local time, to show clocks correctly on devices with a wrong clock. */
  clockOffset: number;
  lastError: { code: string; message: string; at: number } | null;
};

const HEARTBEAT_MS = 20_000;

export class GameConnection {
  private state: ConnectionState = { status: "connecting", userId: null, views: {}, clockOffset: 0, lastError: null };
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private watching = new Set<string>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Bumped by start/stop: a connect attempt from an older generation gives up. */
  private generation = 0;
  private running = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private set(patch: Partial<ConnectionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Starts (or restarts) connecting. Safe to call after stop(), e.g. React's dev double-mount. */
  start() {
    this.generation++;
    this.running = true;
    void this.connect(this.generation);
  }

  private async connect(gen: number) {
    if (!this.running || gen !== this.generation) return;
    let token: string | null = null;
    let wsUrl = process.env.NEXT_PUBLIC_GAME_WS_URL ?? "ws://localhost:4000/ws";
    try {
      const res = await fetch("/api/game-token", { cache: "no-store" });
      const body = (await res.json()) as { token: string | null; wsUrl: string };
      token = body.token;
      wsUrl = body.wsUrl;
    } catch {
      return this.scheduleReconnect(gen);
    }
    if (!this.running || gen !== this.generation) return;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: "hello", ...(token ? { token } : {}) });
      for (const tableId of this.watching) this.send({ t: "watch_table", tableId });
      this.heartbeat = setInterval(() => this.send({ t: "ping" }), HEARTBEAT_MS);
    };
    ws.onmessage = (event) => this.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    ws.onclose = (event) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.ws !== ws || !this.running) return;
      this.ws = null;
      if (event.code === 4000) return this.set({ status: "replaced" }); // opened in another window
      this.scheduleReconnect(gen);
    };
  }

  private scheduleReconnect(gen: number) {
    if (!this.running || gen !== this.generation) return;
    this.set({ status: "reconnecting" });
    const delay = Math.min(10_000, 500 * 2 ** this.retry++) + Math.random() * 300;
    this.retryTimer = setTimeout(() => void this.connect(gen), delay);
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case "welcome":
        this.retry = 0;
        return this.set({ status: "open", userId: msg.userId, clockOffset: msg.serverTime - Date.now() });
      case "table_view":
        return this.set({ views: { ...this.state.views, [msg.view.tableId]: msg.view }, clockOffset: msg.serverTime - Date.now() });
      case "error":
        return this.set({ lastError: { code: msg.code, message: msg.message, at: Date.now() } });
      case "pong":
        return;
    }
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  watch(tableId: string) {
    this.watching.add(tableId);
    this.send({ t: "watch_table", tableId });
  }

  unwatch(tableId: string) {
    this.watching.delete(tableId);
    this.send({ t: "unwatch_table", tableId });
  }

  /** Reports an error from the client side (e.g. sending while disconnected). */
  fail(message: string) {
    this.set({ lastError: { code: "client", message, at: Date.now() } });
  }

  stop() {
    this.running = false;
    this.generation++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
    this.ws = null;
  }
}
