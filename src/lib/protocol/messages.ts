import { z } from "zod";
import type { BlindLevel } from "@/lib/poker/types";
import type { TableView } from "@/lib/poker/view";

// WebSocket protocol between browser and game server (design.md §6.4).
// Every incoming message is validated with these schemas; anything else is rejected.

const id = z.string().min(1).max(64);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["fold", "check", "call", "allin"]) }),
  z.object({ type: z.enum(["bet", "raise"]), toAmount: z.number().int().positive() }),
]);

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), token: z.string().max(2000).optional() }),
  z.object({ t: z.literal("watch_table"), tableId: id }),
  z.object({ t: z.literal("unwatch_table"), tableId: id }),
  z.object({ t: z.literal("take_seat"), tableId: id }), // practice tables only
  z.object({ t: z.literal("leave_seat"), tableId: id }),
  z.object({ t: z.literal("act"), tableId: id, handNo: z.number().int().positive(), actionId: id, action: actionSchema }),
  z.object({ t: z.literal("pre_action"), tableId: id, value: z.enum(["check_fold", "call_any"]).nullable() }),
  z.object({ t: z.literal("sit_in"), tableId: id }),
  z.object({ t: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type PreAction = "check_fold" | "call_any";

export type TablePlayerView = {
  seatNo: number;
  playerId: string;
  name: string;
  avatarUrl: string | null;
  /** Chips behind right now (during a hand: not counting chips already bet). */
  stack: number;
  isBot: boolean;
  sittingOut: boolean;
};

/** Everything one viewer may know about a table. Built per viewer; never shared between viewers. */
export type ClientTableView = {
  tableId: string;
  name: string;
  maxSeats: number;
  practice: boolean;
  status: "waiting" | "playing" | "paused" | "closed";
  level: BlindLevel;
  players: TablePlayerView[];
  /** Current hand, or the last finished one until the next starts. */
  hand: TableView | null;
  /** Whose clock is running, and until when (epoch ms). */
  turn: { seatNo: number; deadline: number; timeBank: boolean } | null;
  /** The viewer's seat, or null for spectators. */
  you: { seatNo: number; sittingOut: boolean; preAction: PreAction | null; timeBankMs: number } | null;
  nextHandAt: number | null;
  notice: string | null;
};

export type ServerMessage =
  | { t: "welcome"; userId: string | null; name: string | null; serverTime: number }
  | { t: "table_view"; view: ClientTableView; serverTime: number }
  | { t: "error"; code: string; message: string; ref?: string }
  | { t: "pong"; serverTime: number };

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Message is not valid JSON." };
  }
  const parsed = clientMessageSchema.safeParse(data);
  return parsed.success ? { ok: true, message: parsed.data } : { ok: false, error: "Unknown or malformed message." };
}
