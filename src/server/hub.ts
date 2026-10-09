import { WebSocket, type WebSocketServer } from "ws";
import type { GameIdentity } from "@/lib/gameToken";
import { parseClientMessage, type ClientMessage, type ServerMessage } from "@/lib/protocol/messages";
import type { TableManager } from "./tableManager";

// WebSocket connections (design.md §6.3–6.5): authentication, subscriptions, per-viewer views, rate limits.

type Conn = {
  ws: WebSocket;
  openedAt: number;
  identity: GameIdentity | null;
  greeted: boolean;
  watching: Set<string>;
  recent: number[]; // message times (rate limit)
  recentActs: number[];
  alive: boolean;
};

export type HubOptions = {
  verifyToken: (token: string) => Promise<GameIdentity | null>;
  maxConnectionsPerUser?: number;
  heartbeatMs?: number;
};

const LIMITS = { messagesPerSecond: 20, actsPerSecond: 5 };

export class Hub {
  private conns = new Set<Conn>();
  private heartbeat: NodeJS.Timeout;

  constructor(
    private readonly wss: WebSocketServer,
    private readonly tables: TableManager,
    private readonly options: HubOptions,
  ) {
    wss.on("connection", (ws) => this.onConnection(ws));
    tables.on("change", (tableId) => this.broadcast(tableId));
    this.heartbeat = setInterval(() => this.checkAlive(), options.heartbeatMs ?? 30_000);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.terminate();
    this.conns.clear();
  }

  connectionCount(): number {
    return this.conns.size;
  }

  private onConnection(ws: WebSocket) {
    const conn: Conn = { ws, openedAt: Date.now(), identity: null, greeted: false, watching: new Set(), recent: [], recentActs: [], alive: true };
    this.conns.add(conn);
    ws.on("pong", () => (conn.alive = true));
    ws.on("close", () => this.conns.delete(conn));
    ws.on("error", () => ws.terminate());
    ws.on("message", (data, isBinary) => {
      if (isBinary) return this.send(conn, { t: "error", code: "bad_message", message: "Text messages only." });
      void this.onMessage(conn, data.toString()).catch((error) => {
        console.error("[hub] message failed", error);
        this.send(conn, { t: "error", code: "server_error", message: "Something went wrong." });
      });
    });
  }

  private send(conn: Conn, message: ServerMessage) {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(message));
  }

  /** Each watcher gets the view for their own identity: never a shared message. */
  private sendView(conn: Conn, tableId: string) {
    const table = this.tables.get(tableId);
    if (!table) return;
    this.send(conn, { t: "table_view", view: table.viewFor(conn.identity?.userId ?? null), serverTime: Date.now() });
  }

  private broadcast(tableId: string) {
    for (const conn of this.conns) if (conn.watching.has(tableId)) this.sendView(conn, tableId);
  }

  private limited(times: number[], perSecond: number): boolean {
    const now = Date.now();
    while (times.length && now - times[0] > 1000) times.shift();
    if (times.length >= perSecond) return true;
    times.push(now);
    return false;
  }

  private async onMessage(conn: Conn, raw: string) {
    if (this.limited(conn.recent, LIMITS.messagesPerSecond)) {
      return this.send(conn, { t: "error", code: "rate_limited", message: "Too many messages. Slow down." });
    }
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return this.send(conn, { t: "error", code: "bad_message", message: parsed.error });
    const msg = parsed.message;

    if (msg.t === "ping") return this.send(conn, { t: "pong", serverTime: Date.now() });
    if (msg.t === "hello") return this.hello(conn, msg.token);
    if (!conn.greeted) return this.send(conn, { t: "error", code: "say_hello", message: "Send hello first." });

    switch (msg.t) {
      case "watch_table": {
        if (!this.tables.get(msg.tableId)) return this.send(conn, { t: "error", code: "not_found", message: "Table not found." });
        conn.watching.add(msg.tableId);
        return this.sendView(conn, msg.tableId);
      }
      case "unwatch_table":
        conn.watching.delete(msg.tableId);
        return;
      default:
        return this.playerMessage(conn, msg);
    }
  }

  private async hello(conn: Conn, token: string | undefined) {
    if (conn.greeted) return;
    conn.greeted = true;
    conn.identity = token ? await this.options.verifyToken(token) : null;
    if (token && !conn.identity) {
      this.send(conn, { t: "error", code: "bad_token", message: "Your session expired. Watching as a spectator." });
    }
    if (conn.identity) this.enforceConnectionLimit(conn.identity.userId);
    this.send(conn, { t: "welcome", userId: conn.identity?.userId ?? null, name: conn.identity?.name ?? null, serverTime: Date.now() });
  }

  /** At most N open connections per user: the oldest are closed. */
  private enforceConnectionLimit(userId: string) {
    const mine = [...this.conns].filter((c) => c.identity?.userId === userId).sort((a, b) => a.openedAt - b.openedAt);
    const max = this.options.maxConnectionsPerUser ?? 3;
    for (const old of mine.slice(0, Math.max(0, mine.length - max))) old.ws.close(4000, "Opened in another window");
  }

  private async playerMessage(conn: Conn, msg: Exclude<ClientMessage, { t: "hello" | "ping" | "watch_table" | "unwatch_table" }>) {
    const who = conn.identity;
    if (!who) return this.send(conn, { t: "error", code: "login_required", message: "Log in to play." });
    const table = this.tables.get(msg.tableId);
    if (!table) return this.send(conn, { t: "error", code: "not_found", message: "Table not found." });

    switch (msg.t) {
      case "take_seat": {
        const error = await this.tables.takeSeat(msg.tableId, who);
        if (error) return this.send(conn, { t: "error", ...error });
        conn.watching.add(msg.tableId);
        return this.sendView(conn, msg.tableId);
      }
      case "leave_seat":
        return table.leave(who.userId);
      case "act": {
        if (this.limited(conn.recentActs, LIMITS.actsPerSecond)) {
          return this.send(conn, { t: "error", code: "rate_limited", message: "Too many actions.", ref: msg.actionId });
        }
        const error = await table.act(who.userId, msg.handNo, msg.actionId, msg.action);
        if (error) this.send(conn, { t: "error", ...error, ref: msg.actionId });
        return;
      }
      case "pre_action":
        return table.setPreAction(who.userId, msg.value);
      case "sit_in":
        return table.sitIn(who.userId);
    }
  }

  private checkAlive() {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
  }
}
