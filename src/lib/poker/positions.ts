import type { Positions } from "./types";

// Button and blinds between hands (design.md §5.8): dead-button rule.
// The big blind always moves forward one player; the small blind and button follow it
// into the seats the BB and SB used last hand, even if those seats are now empty.

/** Items in clockwise order starting with the first seat after `seatNo`. */
export function clockwiseAfter<T extends { seatNo: number }>(items: readonly T[], seatNo: number): T[] {
  const sorted = [...items].sort((a, b) => a.seatNo - b.seatNo);
  return [...sorted.filter((x) => x.seatNo > seatNo), ...sorted.filter((x) => x.seatNo <= seatNo)];
}

function nextOccupied(occupied: readonly number[], after: number): number {
  return clockwiseAfter(occupied.map((seatNo) => ({ seatNo })), after)[0].seatNo;
}

function assertPlayers(occupied: readonly number[]) {
  if (occupied.length < 2) throw new Error("A hand needs at least 2 players.");
  if (new Set(occupied).size !== occupied.length) throw new Error("Duplicate seat numbers.");
}

/** First hand at a table: the button is given (e.g. drawn at random). */
export function initialPositions(occupied: readonly number[], buttonSeat: number): Positions {
  assertPlayers(occupied);
  if (!occupied.includes(buttonSeat)) throw new Error(`Button seat ${buttonSeat} is empty.`);
  if (occupied.length === 2) {
    // Heads-up: the button posts the small blind.
    return { buttonSeat, sbSeat: buttonSeat, bbSeat: nextOccupied(occupied, buttonSeat) };
  }
  const sbSeat = nextOccupied(occupied, buttonSeat);
  return { buttonSeat, sbSeat, bbSeat: nextOccupied(occupied, sbSeat) };
}

/** Positions for the next hand, given last hand's positions and the seats now occupied. */
export function nextPositions(prev: Positions, occupied: readonly number[]): Positions {
  assertPlayers(occupied);
  const bbSeat = nextOccupied(occupied, prev.bbSeat);
  if (occupied.length === 2) {
    // Heads-up: the other player has the button and posts the small blind.
    const other = occupied.find((s) => s !== bbSeat)!;
    return { buttonSeat: other, sbSeat: other, bbSeat };
  }
  return { buttonSeat: prev.sbSeat, sbSeat: prev.bbSeat, bbSeat };
}
