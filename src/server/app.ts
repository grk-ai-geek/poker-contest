import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import type { PrismaClient } from "@/generated/prisma/client";
import { verifyGameToken } from "@/lib/gameToken";
import { Hub } from "./hub";
import { PrismaTableStore } from "./store";
import { TableManager, type ManagerOptions } from "./tableManager";

// The game server (design.md §6): HTTP (health + internal API) and the WebSocket endpoint /ws.

export type GameServerOptions = {
  db: PrismaClient;
  port: number;
  internalSecret: string;
  gameTokenSecret: string;
  allowedOrigins: string[];
  manager?: ManagerOptions;
};

export type GameServer = { server: Server; manager: TableManager; hub: Hub; port: number; close(): Promise<void> };

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 10_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString() || "{}";
  return JSON.parse(text);
}

function authorized(req: IncomingMessage, secret: string): boolean {
  const given = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function startGameServer(opts: GameServerOptions): Promise<GameServer> {
  const manager = new TableManager(opts.db, new PrismaTableStore(opts.db), opts.manager);
  const restored = await manager.restoreAll();
  if (restored) console.log(`[game] restored ${restored} open table(s)`);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, tables: manager.all().length });
      }
      if (url.pathname.startsWith("/internal/")) {
        if (!authorized(req, opts.internalSecret)) return json(res, 401, { error: "unauthorized" });
        if (req.method === "POST" && url.pathname === "/internal/practice-tables") {
          const body = (await readJson(req)) as { bots?: number; maxSeats?: number; bb?: number };
          const table = await manager.createPracticeTable(body);
          return json(res, 201, { tableId: table.id });
        }
        const close = url.pathname.match(/^\/internal\/tables\/([\w-]+)\/close$/);
        if (req.method === "POST" && close) {
          return json(res, (await manager.closeTable(close[1])) ? 200 : 404, {});
        }
        if (req.method === "GET" && url.pathname === "/internal/tables") {
          return json(res, 200, {
            tables: manager.all().map((t) => ({ id: t.id, name: t.config.name, practice: t.config.practice, players: t.seatedPlayers().length })),
          });
        }
      }
      json(res, 404, { error: "not_found" });
    } catch (error) {
      console.error("[game] request failed", error);
      json(res, 500, { error: "server_error" });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = req.headers.origin;
    // Browsers always send Origin: only our site may connect. (Non-browser clients still need a valid token to play.)
    if (url.pathname !== "/ws" || (origin && !opts.allowedOrigins.includes(origin))) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const hub = new Hub(wss, manager, { verifyToken: (token) => verifyGameToken(token, opts.gameTokenSecret) });

  await new Promise<void>((resolve) => server.listen(opts.port, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  return {
    server,
    manager,
    hub,
    port,
    async close() {
      hub.close();
      wss.close();
      await manager.stopAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
