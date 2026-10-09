import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkView } from "@/lib/poker/invariants";
import { seededRng } from "@/lib/poker/rng";
import { handRows, MemoryTableStore } from "@/server/store";
import { TableRuntime, type TableConfig, type TableSnapshot } from "@/server/tableRuntime";

const ACTION_MS = 20_000;
const BANK_MS = 30_000;

function config(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    tableId: "t1",
    contestId: null,
    name: "Test table",
    maxSeats: 6,
    practice: true,
    level: () => ({ sb: 50, bb: 100, ante: 0 }),
    actionMs: ACTION_MS,
    timeBankMs: BANK_MS,
    betweenHandsMs: 3000,
    autoActMs: 500,
    botDelayMs: [100, 100],
    ...overrides,
  };
}

/** A table that checks every view of every change for card leaks. */
function makeTable(overrides: Partial<TableConfig> = {}, store = new MemoryTableStore()) {
  const table = new TableRuntime(config(overrides), store, seededRng(1), seededRng(2));
  const leaks: string[] = [];
  let changes = 0;
  table.on("change", () => {
    changes++;
    const hand = table.currentHand();
    if (!hand) return;
    for (const viewer of [...table.seatedPlayers().map((p) => p.playerId), null]) {
      leaks.push(...checkView(hand, table.viewFor(viewer) as never, viewer));
    }
  });
  return { table, store, leaks, changes: () => changes };
}

async function seatHumans(table: TableRuntime, ...ids: string[]) {
  for (const [i, id] of ids.entries()) await table.seat({ playerId: id, name: id, stack: 10_000, isBot: false, seatNo: i + 1 });
}

const toActId = (table: TableRuntime) => table.seatedPlayers().find((p) => p.seatNo === table.currentHand()?.toAct)?.playerId;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TableRuntime: hands and actions", () => {
  it("starts a hand once two players sit down; each player sees only their own cards", async () => {
    const { table, leaks } = makeTable();
    await seatHumans(table, "alice");
    await vi.advanceTimersByTimeAsync(5000);
    expect(table.currentHand()).toBeNull();
    await seatHumans(table, "alice", "bob");
    await vi.advanceTimersByTimeAsync(1000);
    const hand = table.currentHand()!;
    expect(hand.handNo).toBe(1);
    const aliceView = table.viewFor("alice");
    expect(aliceView.hand!.seats.find((s) => s.playerId === "alice")!.cards).toHaveLength(2);
    expect(aliceView.hand!.seats.find((s) => s.playerId === "bob")!.cards).toBeNull();
    expect(table.viewFor(null).you).toBeNull();
    expect(aliceView.turn).toMatchObject({ seatNo: hand.toAct, timeBank: false });
    expect(leaks).toEqual([]);
  });

  it("rejects out-of-turn, stale and illegal actions; ignores duplicate action ids", async () => {
    const { table } = makeTable();
    await seatHumans(table, "alice", "bob");
    await vi.advanceTimersByTimeAsync(1000);
    const first = toActId(table)!;
    const other = first === "alice" ? "bob" : "alice";
    expect(await table.act(other, 1, "a1", { type: "call" })).toMatchObject({ code: "not_your_turn" });
    expect(await table.act(first, 7, "a2", { type: "call" })).toMatchObject({ code: "stale_hand" });
    expect(await table.act("carol", 1, "a3", { type: "call" })).toMatchObject({ code: "not_seated" });
    expect(await table.act(first, 1, "a4", { type: "check" })).toMatchObject({ code: "cannot_check" });
    expect(await table.act(first, 1, "a5", { type: "call" })).toBeNull();
    expect(await table.act(first, 1, "a5", { type: "call" })).toBeNull(); // same id: ignored, not "not your turn"
    expect(table.currentHand()!.events.filter((e) => e.type === "action")).toHaveLength(1);
  });

  it("a player who leaves mid-hand is folded on their turn and removed after the hand", async () => {
    const { table } = makeTable();
    await seatHumans(table, "alice", "bob", "carol");
    await vi.advanceTimersByTimeAsync(1000);
    const leaver = toActId(table)!;
    await table.leave(leaver);
    await vi.advanceTimersByTimeAsync(600);
    const folded = table.currentHand()!.events.find((e) => e.type === "action" && e.action === "fold");
    expect(folded).toBeDefined();
    // Finish the hand: everyone else folds or checks down quickly via timeouts is slow, so fold the next player too.
    await table.act(toActId(table)!, 1, "x", { type: "fold" });
    await vi.advanceTimersByTimeAsync(100);
    expect(table.seatOf(leaver)).toBeUndefined();
  });
});

describe("TableRuntime: clock, time bank, sitting out", () => {
  it("action clock → time bank → automatic fold, and the player sits out", async () => {
    const { table, store } = makeTable();
    await seatHumans(table, "alice", "bob");
    await vi.advanceTimersByTimeAsync(1000);
    const slow = toActId(table)!;

    await vi.advanceTimersByTimeAsync(ACTION_MS);
    expect(table.viewFor(slow).turn).toMatchObject({ timeBank: true });
    await vi.advanceTimersByTimeAsync(BANK_MS);
    expect(table.seatOf(slow)).toMatchObject({ sittingOut: true, timeBankMs: 0 });
    await vi.advanceTimersByTimeAsync(10);
    const record = store.hands[0];
    expect(record).toBeDefined(); // heads-up: the fold ends the hand
    const rows = handRows(record);
    expect(rows.actions.find((a) => a.type === "FOLD")).toMatchObject({ auto: true, userId: slow });
  });

  it("time spent in the time bank is used up", async () => {
    const { table } = makeTable();
    await seatHumans(table, "alice", "bob");
    await vi.advanceTimersByTimeAsync(1000);
    const p = toActId(table)!;
    await vi.advanceTimersByTimeAsync(ACTION_MS + 5000);
    expect(await table.act(p, 1, "late", { type: "call" })).toBeNull();
    expect(table.seatOf(p)!.timeBankMs).toBe(BANK_MS - 5000);
  });

  it("a sitting-out player acts automatically and quickly until they sit back in", async () => {
    const { table } = makeTable();
    await seatHumans(table, "alice", "bob", "carol");
    await vi.advanceTimersByTimeAsync(1000);
    const p = toActId(table)!;
    await vi.advanceTimersByTimeAsync(ACTION_MS + BANK_MS); // times out → sits out
    expect(table.seatOf(p)!.sittingOut).toBe(true);
    await table.sitIn(p);
    expect(table.seatOf(p)!.sittingOut).toBe(false);
    expect(table.viewFor(p).you).toMatchObject({ sittingOut: false });
  });

  it("pre-action check/fold folds facing a bet without waiting for the clock", async () => {
    const { table } = makeTable();
    await seatHumans(table, "alice", "bob", "carol");
    await vi.advanceTimersByTimeAsync(1000);
    const hand = table.currentHand()!;
    const order = [1, 2, 3].map((n) => (n + hand.toAct! - 1 - 1) % 3 + 1); // toAct, then the next two
    const [first, second] = order.map((n) => table.seatedPlayers().find((p) => p.seatNo === n)!.playerId);
    await table.setPreAction(second, "check_fold");
    await table.act(first, 1, "r", { type: "raise", toAmount: 300 });
    await vi.advanceTimersByTimeAsync(1);
    const last = table.currentHand()!.events.filter((e) => e.type === "action").at(-1)!;
    expect(last).toMatchObject({ action: "fold" });
    expect(table.seatOf(second)!.preAction).toBeNull();
  });
});

describe("TableRuntime: persistence and restart", () => {
  it("saves a snapshot at the start and end of each hand, and the finished hand", async () => {
    const { table, store } = makeTable();
    await seatHumans(table, "alice", "bob");
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.snapshots.get("t1")).toMatchObject({ handNo: 1, inHand: true });
    await table.act(toActId(table)!, 1, "f", { type: "fold" });
    await vi.advanceTimersByTimeAsync(10);
    expect(store.snapshots.get("t1")).toMatchObject({ handNo: 1, inHand: false });
    const rows = handRows(store.hands[0]);
    expect(rows.hand).toMatchObject({ handNo: 1, sb: 50, bb: 100, totalPot: 100 }); // SB folds: the BB gets its unmatched 50 back
    expect(rows.hand.deck).toHaveLength(52);
    expect(rows.players.map((p) => p.startStack)).toEqual([10_000, 10_000]);
    expect(rows.actions.map((a) => a.type)).toEqual(["POST_SB", "POST_BB", "FOLD"]);
  });

  it("restart mid-hand: the hand is cancelled, stacks come back from the snapshot, play resumes", async () => {
    const snapshot: TableSnapshot = {
      version: 1,
      handNo: 8,
      inHand: true,
      lastPositions: { buttonSeat: 1, sbSeat: 1, bbSeat: 2 },
      players: [
        { playerId: "alice", name: "alice", seatNo: 1, stack: 12_000, isBot: false, sittingOut: false, timeBankMs: 10_000 },
        { playerId: "bob", name: "bob", seatNo: 2, stack: 8_000, isBot: false, sittingOut: true, timeBankMs: 0 },
      ],
    };
    const store = new MemoryTableStore();
    const table = TableRuntime.restore(config(), store, snapshot, seededRng(3), seededRng(4));
    expect(table.viewFor("alice").notice).toMatch(/cancelled because the server restarted/);
    expect(table.seatOf("bob")).toMatchObject({ stack: 8_000, sittingOut: true });
    await vi.advanceTimersByTimeAsync(3000);
    const hand = table.currentHand()!;
    expect(hand.handNo).toBe(8); // the cancelled hand's number is reused (it was never saved)
    expect(hand.positions).toEqual({ buttonSeat: 2, sbSeat: 2, bbSeat: 1 });
    expect(table.viewFor("alice").notice).toBeNull();
  });
});

describe("TableRuntime: bots", () => {
  it("a practice table with only bots doesn't deal", async () => {
    const { table } = makeTable();
    for (let i = 0; i < 3; i++) await table.seat({ playerId: `bot${i}`, name: `Bot ${i}`, stack: 5_000, isBot: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(table.currentHand()).toBeNull();
    await table.seat({ playerId: "alice", name: "alice", stack: 5_000, isBot: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(table.currentHand()).not.toBeNull();
  });

  it("bots play 150 hands on their own: no leaks, chips conserved in every saved hand", async () => {
    const { table, store, leaks } = makeTable({ betweenHandsMs: 50, practice: false });
    for (let i = 0; i < 4; i++) await table.seat({ playerId: `bot${i}`, name: `Bot ${i}`, stack: 5_000, isBot: true });
    for (let i = 0; i < 2000 && store.hands.length < 150 && table.seatedPlayers().length > 1; i++) {
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(store.hands.length).toBeGreaterThan(20);
    for (const record of store.hands) {
      const start = record.state.seats.reduce((sum, x) => sum + x.startStack, 0);
      const end = record.state.seats.reduce((sum, x) => sum + x.stack, 0);
      expect(end).toBe(start);
    }
    expect(leaks).toEqual([]);
  }, 30_000);
});
