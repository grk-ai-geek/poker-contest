import type { Card } from "./cards";

// Types for the poker engine (design.md §5). All chip amounts are whole numbers.

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type BlindLevel = { sb: number; bb: number; ante: number };

/**
 * Seat numbers of the button, small blind and big blind for one hand.
 * Under the dead-button rule the button and SB seats may be empty; the BB seat never is.
 * Heads-up: buttonSeat === sbSeat.
 */
export type Positions = { buttonSeat: number; sbSeat: number; bbSeat: number };

export type SeatStatus = "active" | "folded" | "allin";

export type Seat = {
  seatNo: number;
  playerId: string;
  startStack: number;
  /** Chips behind (not yet in the pot). */
  stack: number;
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in this hand, all streets (blinds included, ante excluded: antes are dead money). */
  committed: number;
  hole: Card[];
  status: SeatStatus;
  /** Acted voluntarily on this street (posting a blind doesn't count). */
  hasActed: boolean;
  /** currentBet at the player's last action: decides whether a later short all-in reopens raising. */
  actedFacing: number;
  vpip: boolean;
  pfr: boolean;
};

export type ActionInput =
  | { type: "fold" | "check" | "call" | "allin" }
  | { type: "bet" | "raise"; toAmount: number };

export type LegalActions = {
  /** Chips needed to match the current bet (may be more than the stack). */
  toCall: number;
  fold: true;
  check: boolean;
  /** Chips a call adds (capped at the stack), or null when there is nothing to call. */
  call: number | null;
  /** Bet/raise range as "raise to" totals for this street; minTo === maxTo for an all-in below a full raise. */
  raise: { kind: "bet" | "raise"; minTo: number; maxTo: number } | null;
};

/** Hand log. Never contains hidden cards: hole cards appear only in "show" events. */
export type HandEvent =
  | { type: "post"; seatNo: number; blind: "sb" | "bb" | "ante"; amount: number }
  | { type: "deal" }
  | {
      type: "action";
      seatNo: number;
      street: Street;
      action: "fold" | "check" | "call" | "bet" | "raise";
      /** Chips added by this action. */
      amount: number;
      /** The player's total bet on this street afterwards. */
      toAmount: number;
      allIn: boolean;
    }
  | { type: "uncalled"; seatNo: number; amount: number }
  | { type: "street"; street: Street; cards: Card[] }
  | { type: "show"; seatNo: number; cards: Card[]; handName: string }
  | { type: "award"; potIndex: number; amount: number; winners: { seatNo: number; amount: number }[]; handName: string | null };

export type PotAward = {
  amount: number;
  eligible: number[];
  winners: { seatNo: number; amount: number }[];
  /** Winning hand name, or null when won without a showdown. */
  handName: string | null;
};

export type ShownHand = { seatNo: number; cards: Card[]; handName: string; best5: Card[] };

export type HandResult = {
  showdown: boolean;
  /** Main pot first, then side pots. */
  awards: PotAward[];
  /** In showdown order. */
  shown: ShownHand[];
};

export type HandState = {
  handNo: number;
  level: BlindLevel;
  positions: Positions;
  /** Players dealt in, in seat order. */
  seats: Seat[];
  /** Undealt cards, top first. */
  deck: Card[];
  burned: Card[];
  board: Card[];
  /** The shuffled deck as dealt (for admin audit only). */
  initialDeck: Card[];
  street: Street;
  /** Seat whose turn it is, or null (hand over or between streets). */
  toAct: number | null;
  /** Highest bet on this street (pre-flop: at least the big blind). */
  currentBet: number;
  /** Size of the last full bet/raise on this street: the minimum raise increment. */
  lastFullRaise: number;
  /** Last player to bet/raise on this street (decides who shows first). */
  lastAggressor: number | null;
  /** Antes: dead money that goes into the main pot. */
  deadMoney: number;
  events: HandEvent[];
  ended: boolean;
  result: HandResult | null;
};
