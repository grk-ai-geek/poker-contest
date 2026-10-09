import { isCard, type Card } from "./cards";
import { evaluate } from "./evaluate";
import { clockwiseAfter } from "./positions";
import { buildPots } from "./pots";
import type { ActionInput, BlindLevel, HandEvent, HandState, LegalActions, Positions, PotAward, Seat, ShownHand, Street } from "./types";

// No-Limit Hold'em hand state machine (design.md §5). Pure: (state, action) → new state.
// No I/O, no clock, no randomness: the shuffled deck is passed in.

export type IllegalCode = "hand_over" | "not_your_turn" | "cannot_check" | "nothing_to_call" | "cannot_raise" | "bad_amount" | "unknown_action";

export class IllegalAction extends Error {
  constructor(
    readonly code: IllegalCode,
    message: string,
  ) {
    super(message);
    this.name = "IllegalAction";
  }
}

export type StartHandInput = {
  handNo: number;
  level: BlindLevel;
  positions: Positions;
  players: readonly { seatNo: number; playerId: string; stack: number }[];
  /** A full shuffled 52-card deck. */
  deck: readonly Card[];
};

const NEXT_STREET: Record<string, { street: Street; cards: number }> = {
  preflop: { street: "flop", cards: 3 },
  flop: { street: "turn", cards: 1 },
  turn: { street: "river", cards: 1 },
};

function isWhole(n: number, min: number): boolean {
  return Number.isInteger(n) && n >= min;
}

function validate(input: StartHandInput) {
  const { players, level, positions, deck } = input;
  if (players.length < 2) throw new Error("A hand needs at least 2 players.");
  if (players.length > 10) throw new Error("At most 10 players per table.");
  if (new Set(players.map((p) => p.seatNo)).size !== players.length) throw new Error("Duplicate seat numbers.");
  if (new Set(players.map((p) => p.playerId)).size !== players.length) throw new Error("Duplicate players.");
  if (!players.every((p) => isWhole(p.stack, 1))) throw new Error("Every player needs a whole, positive stack.");
  if (!isWhole(level.bb, 1) || !isWhole(level.sb, 0) || !isWhole(level.ante, 0)) throw new Error("Invalid blind level.");
  if (!players.some((p) => p.seatNo === positions.bbSeat)) throw new Error("The big blind seat must have a player.");
  if (deck.length !== 52 || new Set(deck).size !== 52 || !deck.every(isCard)) throw new Error("The deck must be 52 distinct cards.");
}

function clone(s: HandState): HandState {
  // Arrays are replaced, never mutated in place, except seats/board/events/burned which are copied here.
  return { ...s, seats: s.seats.map((x) => ({ ...x, hole: [...x.hole] })), board: [...s.board], burned: [...s.burned], events: [...s.events] };
}

function seatOf(s: HandState, seatNo: number): Seat {
  const seat = s.seats.find((x) => x.seatNo === seatNo);
  if (!seat) throw new Error(`No player in seat ${seatNo}.`);
  return seat;
}

function live(s: HandState): Seat[] {
  return s.seats.filter((x) => x.status !== "folded");
}

function draw(s: HandState, n: number): Card[] {
  const cards = s.deck.slice(0, n);
  s.deck = s.deck.slice(n);
  return cards;
}

/** Moves chips from stack to the current bet. */
function putIn(seat: Seat, amount: number) {
  seat.stack -= amount;
  seat.bet += amount;
  seat.committed += amount;
  if (seat.stack === 0) seat.status = "allin";
}

function post(s: HandState, seat: Seat, blind: "sb" | "bb" | "ante", amount: number) {
  const paid = Math.min(amount, seat.stack);
  if (paid === 0) return;
  if (blind === "ante") {
    seat.stack -= paid;
    s.deadMoney += paid;
    if (seat.stack === 0) seat.status = "allin";
  } else {
    putIn(seat, paid);
  }
  s.events.push({ type: "post", seatNo: seat.seatNo, blind, amount: paid });
}

/** Next seat (clockwise after `from`) that must act, or null when the street's betting is over. */
function nextToAct(s: HandState, from: number): number | null {
  const inHand = live(s);
  if (inHand.length <= 1) return null;
  const active = inHand.filter((x) => x.status === "active");
  if (active.length === 0) return null;
  if (active.length === 1) {
    // Nobody left to bet against: the last player only acts if facing a bigger bet.
    const me = active[0];
    const maxOther = Math.max(0, ...inHand.filter((x) => x !== me).map((x) => x.bet));
    return me.bet < maxOther ? me.seatNo : null;
  }
  for (const x of clockwiseAfter(s.seats, from)) {
    if (x.status === "active" && (!x.hasActed || x.bet < s.currentBet)) return x.seatNo;
  }
  return null;
}

/** Deals a new hand and posts blinds and the big-blind ante. */
export function startHand(input: StartHandInput): HandState {
  validate(input);
  const { handNo, level, positions } = input;
  const seats: Seat[] = [...input.players]
    .sort((a, b) => a.seatNo - b.seatNo)
    .map((p) => ({
      seatNo: p.seatNo,
      playerId: p.playerId,
      startStack: p.stack,
      stack: p.stack,
      bet: 0,
      committed: 0,
      hole: [],
      status: "active",
      hasActed: false,
      actedFacing: 0,
      vpip: false,
      pfr: false,
    }));

  const s: HandState = {
    handNo,
    level,
    positions,
    seats,
    deck: [...input.deck],
    burned: [],
    board: [],
    initialDeck: [...input.deck],
    street: "preflop",
    toAct: null,
    currentBet: level.bb,
    lastFullRaise: level.bb,
    lastAggressor: null,
    deadMoney: 0,
    events: [],
    ended: false,
    result: null,
  };

  // Two cards each, one at a time, starting left of the button.
  const order = clockwiseAfter(s.seats, positions.buttonSeat);
  for (let round = 0; round < 2; round++) for (const seat of order) seat.hole.push(...draw(s, 1));
  s.events.push({ type: "deal" });

  const sb = s.seats.find((x) => x.seatNo === positions.sbSeat);
  if (sb && positions.sbSeat !== positions.bbSeat) post(s, sb, "sb", level.sb);
  const bb = seatOf(s, positions.bbSeat);
  post(s, bb, "bb", level.bb);
  // Big-blind ante: the BB pays it after the blind if short (TDA rule).
  if (level.ante > 0) post(s, bb, "ante", level.ante);

  s.toAct = nextToAct(s, positions.bbSeat);
  if (s.toAct === null) closeStreet(s);
  return s;
}

/** What the player in `seatNo` may do now, or null if it isn't their turn. */
export function legalActions(s: HandState, seatNo: number): LegalActions | null {
  if (s.ended || s.toAct !== seatNo) return null;
  const me = seatOf(s, seatNo);
  const toCall = Math.max(0, s.currentBet - me.bet);
  const othersActive = s.seats.some((x) => x !== me && x.status === "active");
  // A short all-in doesn't reopen betting for players who already acted (design.md §5.5).
  const reopened = !me.hasActed || s.currentBet - me.actedFacing >= s.lastFullRaise;
  let raise: LegalActions["raise"] = null;
  if (me.stack > toCall && othersActive && reopened) {
    const maxTo = me.bet + me.stack;
    raise = { kind: s.currentBet === 0 ? "bet" : "raise", minTo: Math.min(s.currentBet + s.lastFullRaise, maxTo), maxTo };
  }
  return { toCall, fold: true, check: toCall === 0, call: toCall > 0 ? Math.min(toCall, me.stack) : null, raise };
}

/** Applies one player action and returns the new state. Throws IllegalAction for anything not allowed. */
export function applyAction(state: HandState, seatNo: number, action: ActionInput): HandState {
  if (state.ended) throw new IllegalAction("hand_over", "The hand is over.");
  const legal = legalActions(state, seatNo);
  if (!legal) throw new IllegalAction("not_your_turn", `It is not seat ${seatNo}'s turn.`);

  const s = clone(state);
  const me = seatOf(s, seatNo);
  const record = (kind: "fold" | "check" | "call" | "bet" | "raise", amount: number) =>
    s.events.push({ type: "action", seatNo, street: s.street, action: kind, amount, toAmount: me.bet, allIn: me.status === "allin" });

  const call = () => {
    if (legal.call === null) throw new IllegalAction("nothing_to_call", "There is no bet to call.");
    putIn(me, legal.call);
    me.hasActed = true;
    me.actedFacing = s.currentBet;
    if (s.street === "preflop") me.vpip = true;
    record("call", legal.call);
  };

  const raiseTo = (to: number) => {
    const kind = s.currentBet === 0 ? "bet" : "raise";
    const added = to - me.bet;
    putIn(me, added);
    const increment = to - s.currentBet;
    if (increment >= s.lastFullRaise) s.lastFullRaise = increment;
    s.currentBet = to;
    s.lastAggressor = seatNo;
    me.hasActed = true;
    me.actedFacing = to;
    if (s.street === "preflop") me.vpip = me.pfr = true;
    record(kind, added);
  };

  switch (action.type) {
    case "fold":
      me.status = "folded";
      me.hasActed = true;
      record("fold", 0);
      break;
    case "check":
      if (!legal.check) throw new IllegalAction("cannot_check", "You can't check facing a bet.");
      me.hasActed = true;
      me.actedFacing = s.currentBet;
      record("check", 0);
      break;
    case "call":
      call();
      break;
    case "bet":
    case "raise": {
      if (!legal.raise || legal.raise.kind !== action.type) {
        throw new IllegalAction("cannot_raise", action.type === "bet" ? "You can't bet now." : "You can't raise now.");
      }
      const to = action.toAmount;
      if (!Number.isInteger(to) || to < legal.raise.minTo || to > legal.raise.maxTo) {
        throw new IllegalAction("bad_amount", `Amount must be between ${legal.raise.minTo} and ${legal.raise.maxTo}.`);
      }
      raiseTo(to);
      break;
    }
    case "allin":
      if (me.stack <= legal.toCall) call();
      else if (legal.raise) raiseTo(legal.raise.maxTo);
      else throw new IllegalAction("cannot_raise", "You can only call or fold.");
      break;
    default:
      throw new IllegalAction("unknown_action", "Unknown action.");
  }

  s.toAct = null;
  if (live(s).length === 1) {
    finish(s, false);
    return s;
  }
  const next = nextToAct(s, seatNo);
  if (next === null) closeStreet(s);
  else s.toAct = next;
  return s;
}

/** The part of the biggest bet that nobody matched goes back to its owner. */
function returnUncalled(s: HandState) {
  const [top, second] = [...s.seats].sort((a, b) => b.bet - a.bet);
  const extra = top.bet - (second?.bet ?? 0);
  if (extra <= 0) return;
  top.bet -= extra;
  top.committed -= extra;
  top.stack += extra;
  if (top.status === "allin") top.status = "active";
  s.events.push({ type: "uncalled", seatNo: top.seatNo, amount: extra });
}

function dealNextStreet(s: HandState) {
  const next = NEXT_STREET[s.street];
  s.burned.push(...draw(s, 1));
  const cards = draw(s, next.cards);
  s.board.push(...cards);
  s.street = next.street;
  s.lastAggressor = null;
  s.events.push({ type: "street", street: next.street, cards });
}

function closeStreet(s: HandState) {
  returnUncalled(s);
  for (const x of s.seats) {
    x.bet = 0;
    x.hasActed = false;
    x.actedFacing = 0;
  }
  s.currentBet = 0;
  s.lastFullRaise = s.level.bb;
  s.toAct = null;

  if (live(s).length === 1) return finish(s, false);
  if (s.street === "river") return finish(s, true);

  const canBet = live(s).filter((x) => x.status === "active").length >= 2;
  if (!canBet) {
    // Everyone (or all but one) is all-in: run out the board.
    while (s.board.length < 5) dealNextStreet(s);
    return finish(s, true);
  }
  dealNextStreet(s);
  const next = nextToAct(s, s.positions.buttonSeat);
  if (next === null) return closeStreet(s);
  s.toAct = next;
}

/** Showdown order: the river's last aggressor first, otherwise the first player left of the button. */
function showdownOrder(s: HandState): Seat[] {
  const inHand = live(s);
  const aggressor = inHand.find((x) => x.seatNo === s.lastAggressor);
  if (!aggressor) return clockwiseAfter(inHand, s.positions.buttonSeat);
  return [aggressor, ...clockwiseAfter(inHand, aggressor.seatNo).filter((x) => x !== aggressor)];
}

function finish(s: HandState, showdown: boolean) {
  returnUncalled(s);
  s.toAct = null;
  if (showdown) s.street = "showdown";

  const pots = buildPots(
    s.seats.map((x) => ({ seatNo: x.seatNo, amount: x.committed, folded: x.status === "folded" })),
    s.deadMoney,
  );

  const shown: ShownHand[] = [];
  const scores = new Map<number, { score: number; name: string }>();
  if (showdown) {
    for (const x of showdownOrder(s)) {
      const ev = evaluate([...x.hole, ...s.board]);
      scores.set(x.seatNo, { score: ev.score, name: ev.name });
      shown.push({ seatNo: x.seatNo, cards: [...x.hole], handName: ev.name, best5: ev.best5 });
      s.events.push({ type: "show", seatNo: x.seatNo, cards: [...x.hole], handName: ev.name });
    }
  }

  const awards: PotAward[] = pots.map((pot, potIndex) => {
    let winners = pot.eligible;
    let handName: string | null = null;
    if (showdown && pot.eligible.length > 1) {
      const best = Math.max(...pot.eligible.map((n) => scores.get(n)!.score));
      winners = pot.eligible.filter((n) => scores.get(n)!.score === best);
      handName = scores.get(winners[0])!.name;
    } else if (showdown) {
      handName = scores.get(winners[0])?.name ?? null;
    }
    // Odd chips go to the first winners left of the button.
    const ordered = clockwiseAfter(winners.map((seatNo) => ({ seatNo })), s.positions.buttonSeat).map((x) => x.seatNo);
    const share = Math.floor(pot.amount / ordered.length);
    const odd = pot.amount - share * ordered.length;
    const paid = ordered.map((seatNo, i) => ({ seatNo, amount: share + (i < odd ? 1 : 0) }));
    for (const w of paid) seatOf(s, w.seatNo).stack += w.amount;
    const event: HandEvent = { type: "award", potIndex, amount: pot.amount, winners: paid, handName };
    s.events.push(event);
    return { amount: pot.amount, eligible: pot.eligible, winners: paid, handName };
  });

  s.result = { showdown, awards, shown };
  s.ended = true;
}

/** Chips in the middle from finished streets (main pot first), for display during a hand. */
export function currentPots(s: HandState) {
  return buildPots(
    s.seats.map((x) => ({ seatNo: x.seatNo, amount: x.committed - x.bet, folded: x.status === "folded" })),
    s.deadMoney,
  );
}
