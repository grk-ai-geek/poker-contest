import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { db } from "@/lib/db";
import { signGameToken } from "@/lib/gameToken";
import { seededRng } from "@/lib/poker/rng";
import { randomAction } from "@/lib/poker/sim";
import type { ServerMessage } from "@/lib/protocol/messages";
import { startGameServer, type GameServer } from "@/server/app";

// End to end: real game server + real database + real WebSocket clients playing against dev bots.
// Proves no client ever receives a card it shouldn't, hands are saved, and a restart resumes the table.

process.env.ENABLE_DEV_BOTS = "1";
const SECRET = "integration-test-secret-0123456789abcdef";
const INTERNAL = "internal-test-secret";
const stamp = Date.now();
const FAST = { actionMs: 4000, timeBankMs: 0, betweenHandsMs: 30, autoActMs: 20, botDelayMs: [5, 15] as [number, number] };

let game: GameServer;
let tableId = "";
const users: { id: string; displayName: string }[] = [];

function start() {
  return startGameServer({
    db,
    port: 0,
    internalSecret: INTERNAL,
    gameTokenSecret: SECRET,
    allowedOrigins: ["http://localhost:3000"],
    manager: { tableDefaults: FAST },
  });
}

class Client {
  messages: ServerMessage[] = [];
  private acted = new Set<string>();
  private rng = seededRng(stamp % 1000);

  private constructor(
    readonly ws: WebSocket,
    readonly userId: string | null,
  ) {
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      if (this.autoplay && msg.t === "table_view") this.play(msg);
    });
  }
  autoplay = false;

  static async open(port: number, userId: string | null, headers: Record<string, string> = {}): Promise<Client> {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers });
    await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
    return new Client(ws, userId);
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }

  async waitFor(pred: (m: ServerMessage) => boolean, ms = 10_000): Promise<ServerMessage> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = this.messages.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out waiting for a message (have ${this.messages.length})`);
  }

  private play(msg: Extract<ServerMessage, { t: "table_view" }>) {
    // Went broke on the practice table: sit down again (once per hand number).
    if (!msg.view.you && this.userId) {
      const key = `seat:${msg.view.hand?.handNo ?? 0}`;
      if (!this.acted.has(key)) {
        this.acted.add(key);
        this.send({ t: "take_seat", tableId: msg.view.tableId });
      }
      return;
    }
    const hand = msg.view.hand;
    const legal = hand?.you?.legal;
    if (!hand || hand.ended || !legal) return;
    const key = `${hand.handNo}:${hand.events.length}`;
    if (this.acted.has(key)) return;
    this.acted.add(key);
    this.send({ t: "act", tableId: msg.view.tableId, handNo: hand.handNo, actionId: key, action: randomAction(legal, this.rng) });
  }

  close() {
    this.ws.close();
  }
}

async function until(check: () => Promise<boolean>, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("condition not met in time");
}

/** Every card a client received must be its own, on the board, or shown at showdown. */
async function leaks(client: Client): Promise<string[]> {
  const hands = await db.hand.findMany({ where: { tableId }, include: { players: true } });
  const problems: string[] = [];
  for (const msg of client.messages) {
    if (msg.t !== "table_view" || !msg.view.hand) continue;
    const saved = hands.find((h) => h.handNo === msg.view.hand!.handNo);
    if (!saved) continue; // cancelled by the restart test
    const text = JSON.stringify(msg);
    for (const p of saved.players) {
      if (p.userId === client.userId || p.shown) continue;
      for (const card of p.holeCards) if (text.includes(`"${card}"`)) problems.push(`hand ${saved.handNo}: saw ${card} of ${p.userId}`);
    }
    const undealt = saved.deck.filter((c) => !saved.board.includes(c) && !saved.players.some((p) => p.holeCards.includes(c)));
    for (const card of undealt) if (text.includes(`"${card}"`)) problems.push(`hand ${saved.handNo}: saw undealt ${card}`);
  }
  return problems;
}

beforeAll(async () => {
  for (const name of ["alice", "bob"]) {
    users.push(
      await db.user.create({
        data: { email: `it_${name}_${stamp}@example.com`, displayName: `it_${name}_${stamp}`.slice(0, 24), emailVerified: new Date() },
        select: { id: true, displayName: true },
      }),
    );
  }
  game = await start();
});

afterAll(async () => {
  await game?.close();
  if (tableId) {
    await db.hand.deleteMany({ where: { tableId } });
    await db.table.deleteMany({ where: { id: tableId } });
  }
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await db.$disconnect();
});

describe("game server", () => {
  it("health and internal API (with auth)", async () => {
    const health = await fetch(`http://localhost:${game.port}/health`);
    expect(await health.json()).toMatchObject({ ok: true });
    const denied = await fetch(`http://localhost:${game.port}/internal/practice-tables`, { method: "POST" });
    expect(denied.status).toBe(401);
    const created = await fetch(`http://localhost:${game.port}/internal/practice-tables`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INTERNAL}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bots: 2, maxSeats: 6, bb: 100 }),
    });
    expect(created.status).toBe(201);
    tableId = ((await created.json()) as { tableId: string }).tableId;
  });

  it("refuses WebSocket connections from other websites", async () => {
    await expect(Client.open(game.port, null, { Origin: "https://evil.example" })).rejects.toThrow();
  });

  it("requires hello first; a bad token means spectator", async () => {
    const c = await Client.open(game.port, null);
    c.send({ t: "watch_table", tableId });
    await c.waitFor((m) => m.t === "error" && m.code === "say_hello");
    c.send({ t: "hello", token: "garbage" });
    await c.waitFor((m) => m.t === "error" && m.code === "bad_token");
    await c.waitFor((m) => m.t === "welcome" && m.userId === null);
    c.send({ t: "take_seat", tableId });
    await c.waitFor((m) => m.t === "error" && m.code === "login_required");
    c.close();
  });

  it("two players and a spectator: hands play, are saved, and nobody sees a hidden card", async () => {
    const players = await Promise.all(users.map((u) => Client.open(game.port, u.id)));
    const spectator = await Client.open(game.port, null);
    for (const [i, c] of players.entries()) {
      c.autoplay = true;
      c.send({ t: "hello", token: await signGameToken({ userId: users[i].id, name: users[i].displayName, role: "USER" }, SECRET) });
      await c.waitFor((m) => m.t === "welcome" && m.userId === users[i].id);
      c.send({ t: "take_seat", tableId });
    }
    spectator.send({ t: "hello" });
    spectator.send({ t: "watch_table", tableId });

    await until(async () => (await db.hand.count({ where: { tableId, players: { some: { userId: users[0].id } } } })) >= 8);

    const hand = await db.hand.findFirst({ where: { tableId, players: { some: { userId: users[0].id } } }, include: { players: true, actions: true } });
    expect(hand!.players.length).toBeGreaterThanOrEqual(2);
    expect(hand!.actions.filter((a) => a.type === "POST_BB")).toHaveLength(1);

    for (const c of [...players, spectator]) expect(await leaks(c)).toEqual([]);
    const seen = spectator.messages.filter((m) => m.t === "table_view").length;
    expect(seen).toBeGreaterThan(10);
    for (const c of [...players, spectator]) c.close();
  });

  it("restart: the table comes back from its snapshot and keeps playing", async () => {
    const before = await db.table.findUniqueOrThrow({ where: { id: tableId } });
    await game.close();
    game = await start();
    expect(game.manager.get(tableId)).toBeDefined();

    const c = await Client.open(game.port, users[0].id);
    c.send({ t: "hello", token: await signGameToken({ userId: users[0].id, name: users[0].displayName, role: "USER" }, SECRET) });
    c.send({ t: "watch_table", tableId });
    const first = (await c.waitFor((m) => m.t === "table_view")) as Extract<ServerMessage, { t: "table_view" }>;
    expect(first.view.tableId).toBe(tableId);
    expect(first.view.players.length).toBeGreaterThanOrEqual(2);
    c.autoplay = true; // sits back down if it went broke before the restart

    await until(async () => (await db.table.findUniqueOrThrow({ where: { id: tableId } })).handNo > before.handNo + 2);
    expect(await leaks(c)).toEqual([]);
    c.close();
  });
});
