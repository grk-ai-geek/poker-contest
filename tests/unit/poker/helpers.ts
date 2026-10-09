import { fullDeck, type Card } from "@/lib/poker/cards";
import { applyAction, startHand } from "@/lib/poker/hand";
import { clockwiseAfter } from "@/lib/poker/positions";
import type { ActionInput, BlindLevel, HandState, Positions } from "@/lib/poker/types";

/**
 * Builds a deck that deals the given hole cards and board, following the engine's order:
 * two rounds of one card each starting left of the button, then burn + flop, burn + turn, burn + river.
 */
export function stackDeck(opts: { seatNos: number[]; buttonSeat: number; holes: Record<number, [Card, Card]>; board?: Card[] }): Card[] {
  const used = new Set<Card>([...Object.values(opts.holes).flat(), ...(opts.board ?? [])]);
  const spare = fullDeck().filter((c) => !used.has(c));
  const take = () => spare.shift()!;
  const order = clockwiseAfter(opts.seatNos.map((seatNo) => ({ seatNo })), opts.buttonSeat).map((x) => x.seatNo);
  const deck: Card[] = [];
  for (let round = 0; round < 2; round++) for (const seatNo of order) deck.push(opts.holes[seatNo]?.[round] ?? take());
  const board = [...(opts.board ?? [])];
  while (board.length < 5) board.push(take());
  deck.push(take(), board[0], board[1], board[2], take(), board[3], take(), board[4]);
  deck.push(...spare);
  return deck;
}

export const LEVEL: BlindLevel = { sb: 50, bb: 100, ante: 0 };

/** Starts a hand. Players are given as { seatNo: stack }; ids are "p<seatNo>". */
export function deal(opts: {
  stacks: Record<number, number>;
  positions: Positions;
  holes?: Record<number, [Card, Card]>;
  board?: Card[];
  level?: BlindLevel;
}): HandState {
  const seatNos = Object.keys(opts.stacks).map(Number);
  return startHand({
    handNo: 1,
    level: opts.level ?? LEVEL,
    positions: opts.positions,
    players: seatNos.map((seatNo) => ({ seatNo, playerId: `p${seatNo}`, stack: opts.stacks[seatNo] })),
    deck: stackDeck({ seatNos, buttonSeat: opts.positions.buttonSeat, holes: opts.holes ?? {}, board: opts.board }),
  });
}

/** Applies actions in order, each checked against whose turn it is. Shorthand: "f", "x", "c", "a", "r300", "b200". */
export function play(state: HandState, ...actions: [seatNo: number, action: string][]): HandState {
  let s = state;
  for (const [seatNo, code] of actions) {
    if (s.toAct !== seatNo) throw new Error(`Expected seat ${seatNo} to act, but toAct is ${s.toAct} (street ${s.street})`);
    s = applyAction(s, seatNo, parse(code));
  }
  return s;
}

export function parse(code: string): ActionInput {
  if (code === "f") return { type: "fold" };
  if (code === "x") return { type: "check" };
  if (code === "c") return { type: "call" };
  if (code === "a") return { type: "allin" };
  if (code.startsWith("r")) return { type: "raise", toAmount: Number(code.slice(1)) };
  if (code.startsWith("b")) return { type: "bet", toAmount: Number(code.slice(1)) };
  throw new Error(`Unknown action code ${code}`);
}

export function stacks(s: HandState): Record<number, number> {
  return Object.fromEntries(s.seats.map((x) => [x.seatNo, x.stack]));
}
