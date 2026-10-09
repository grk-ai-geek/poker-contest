import type { Card } from "./cards";
import { currentPots, legalActions } from "./hand";
import type { BlindLevel, HandEvent, HandResult, HandState, LegalActions, Positions, SeatStatus, Street } from "./types";

// The ONLY way hand state leaves the engine (design.md §6.6).
// Never includes the deck, burned cards, or another player's hole cards unless shown at showdown.

export type SeatView = {
  seatNo: number;
  playerId: string;
  stack: number;
  bet: number;
  status: SeatStatus;
  /** Your own cards, or cards shown at showdown; null when hidden. */
  cards: Card[] | null;
};

export type TableView = {
  handNo: number;
  street: Street;
  level: BlindLevel;
  positions: Positions;
  board: Card[];
  currentBet: number;
  toAct: number | null;
  /** Pots from finished streets, main pot first (current bets are shown in front of the players). */
  pots: number[];
  /** Everything in the middle, current bets included. */
  totalPot: number;
  seats: SeatView[];
  /** The viewer's own seat, with their options when it's their turn. Null for spectators. */
  you: { seatNo: number; legal: LegalActions | null } | null;
  events: HandEvent[];
  ended: boolean;
  result: HandResult | null;
};

/** View of the hand for one player (their playerId) or a spectator (null). */
export function viewFor(s: HandState, viewerId: string | null): TableView {
  const shown = new Map((s.result?.shown ?? []).map((h) => [h.seatNo, h.cards]));
  const mine = viewerId === null ? undefined : s.seats.find((x) => x.playerId === viewerId);
  const pots = s.ended ? [] : currentPots(s).map((p) => p.amount);
  const totalPot = s.ended ? 0 : s.seats.reduce((sum, x) => sum + x.committed, 0) + s.deadMoney;

  return {
    handNo: s.handNo,
    street: s.street,
    level: { ...s.level },
    positions: { ...s.positions },
    board: [...s.board],
    currentBet: s.currentBet,
    toAct: s.toAct,
    pots,
    totalPot,
    seats: s.seats.map((x) => ({
      seatNo: x.seatNo,
      playerId: x.playerId,
      stack: x.stack,
      bet: x.bet,
      status: x.status,
      cards: x === mine ? [...x.hole] : shown.has(x.seatNo) ? [...shown.get(x.seatNo)!] : null,
    })),
    you: mine ? { seatNo: mine.seatNo, legal: legalActions(s, mine.seatNo) } : null,
    events: structuredClone(s.events),
    ended: s.ended,
    result: s.result ? structuredClone(s.result) : null,
  };
}
