import type { PrismaClient } from "@/generated/prisma/client";
import type { HandActionType, Street } from "@/generated/prisma/enums";
import type { HandEvent } from "@/lib/poker/types";
import type { HandRecord, TableSnapshot, TableStore } from "./tableRuntime";

// Persistence for tables (design.md §6.7): snapshots for restart recovery, finished hands for history.

const STREETS: Record<string, Street> = { preflop: "PREFLOP", flop: "FLOP", turn: "TURN", river: "RIVER", showdown: "SHOWDOWN" };
const POSTS: Record<string, HandActionType> = { sb: "POST_SB", bb: "POST_BB", ante: "POST_ANTE" };

/** Turns a finished hand into rows for Hand, HandPlayer and HandAction. */
export function handRows(r: HandRecord) {
  const s = r.state;
  const result = s.result!;
  const won = new Map<number, number>();
  for (const award of result.awards) for (const w of award.winners) won.set(w.seatNo, (won.get(w.seatNo) ?? 0) + w.amount);
  const shown = new Set(result.shown.map((h) => h.seatNo));
  const bySeat = new Map(s.seats.map((x) => [x.seatNo, x.playerId]));

  const actions: {
    seq: number; street: Street; seatNo: number; userId: string; type: HandActionType;
    amount: number; toAmount: number; allIn: boolean; auto: boolean; at: Date;
  }[] = [];
  let street = "preflop";
  s.events.forEach((e: HandEvent, i) => {
    if (e.type === "street") street = e.street;
    if (e.type !== "post" && e.type !== "action") return;
    actions.push({
      seq: actions.length,
      street: STREETS[e.type === "action" ? e.street : street],
      seatNo: e.seatNo,
      userId: bySeat.get(e.seatNo)!,
      type: e.type === "post" ? POSTS[e.blind] : (e.action.toUpperCase() as HandActionType),
      amount: e.amount,
      toAmount: e.type === "action" ? e.toAmount : e.amount,
      allIn: e.type === "action" ? e.allIn : false,
      auto: r.autoEvents.includes(i),
      at: r.eventTimes[i] ?? r.endedAt,
    });
  });

  return {
    hand: {
      tableId: r.tableId,
      contestId: r.contestId,
      handNo: s.handNo,
      sb: s.level.sb,
      bb: s.level.bb,
      ante: s.level.ante,
      buttonSeat: s.positions.buttonSeat,
      board: s.board,
      deck: s.initialDeck,
      totalPot: result.awards.reduce((sum, a) => sum + a.amount, 0),
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    },
    players: s.seats.map((x) => ({
      userId: x.playerId,
      seatNo: x.seatNo,
      startStack: x.startStack,
      endStack: x.stack,
      holeCards: x.hole,
      shown: shown.has(x.seatNo),
      vpip: x.vpip,
      pfr: x.pfr,
      sawShowdown: result.showdown && x.status !== "folded",
      won: won.get(x.seatNo) ?? 0,
    })),
    actions,
  };
}

export class PrismaTableStore implements TableStore {
  constructor(private readonly db: PrismaClient) {}

  async saveSnapshot(tableId: string, snapshot: TableSnapshot): Promise<void> {
    await this.db.table.update({ where: { id: tableId }, data: { snapshot, handNo: snapshot.handNo } });
  }

  async saveHand(record: HandRecord): Promise<void> {
    const { hand, players, actions } = handRows(record);
    await this.db.hand.create({
      data: { ...hand, players: { create: players }, actions: { create: actions } },
    });
  }
}

/** In-memory store for tests. */
export class MemoryTableStore implements TableStore {
  snapshots = new Map<string, TableSnapshot>();
  hands: HandRecord[] = [];

  async saveSnapshot(tableId: string, snapshot: TableSnapshot): Promise<void> {
    this.snapshots.set(tableId, structuredClone(snapshot));
  }

  async saveHand(record: HandRecord): Promise<void> {
    this.hands.push(record);
  }
}
