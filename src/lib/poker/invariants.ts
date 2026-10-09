import { isCard } from "./cards";
import type { HandState } from "./types";
import type { TableView } from "./view";

// Rules that must hold after every action (design.md §5.9). Used by tests and the simulator.
// Each function returns a list of problems (empty = fine).

export function checkHand(s: HandState, totalChips: number): string[] {
  const problems: string[] = [];
  const stacks = s.seats.reduce((sum, x) => sum + x.stack, 0);
  const middle = s.ended ? 0 : s.seats.reduce((sum, x) => sum + x.committed, 0) + s.deadMoney;
  if (stacks + middle !== totalChips) problems.push(`chips not conserved: ${stacks} + ${middle} ≠ ${totalChips}`);

  for (const x of s.seats) {
    if (x.stack < 0 || x.bet < 0 || x.committed < x.bet) problems.push(`seat ${x.seatNo}: negative or inconsistent chips`);
    if (!Number.isInteger(x.stack) || !Number.isInteger(x.bet)) problems.push(`seat ${x.seatNo}: non-integer chips`);
    if (x.status === "allin" && x.stack !== 0 && !s.ended) problems.push(`seat ${x.seatNo}: all-in with chips behind`);
    if (x.status === "active" && x.stack === 0 && !s.ended) problems.push(`seat ${x.seatNo}: active with no chips`);
    if (x.hole.length !== 2) problems.push(`seat ${x.seatNo}: ${x.hole.length} hole cards`);
  }

  const cards = [...s.deck, ...s.burned, ...s.board, ...s.seats.flatMap((x) => x.hole)];
  if (cards.length !== 52 || new Set(cards).size !== 52 || !cards.every(isCard)) problems.push("deck is not 52 distinct cards");

  const boardSize: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };
  if (s.board.length !== boardSize[s.street]) problems.push(`board has ${s.board.length} cards on the ${s.street}`);

  if (s.ended) {
    if (s.toAct !== null) problems.push("hand ended but someone is to act");
    if (!s.result) problems.push("hand ended without a result");
    const awarded = s.result?.awards.reduce((sum, a) => sum + a.amount, 0) ?? 0;
    const potTotal = s.seats.reduce((sum, x) => sum + x.committed, 0) + s.deadMoney;
    if (awarded !== potTotal) problems.push(`awarded ${awarded} but the pot was ${potTotal}`);
  } else {
    const actor = s.seats.find((x) => x.seatNo === s.toAct);
    if (!actor || actor.status !== "active") problems.push(`toAct ${s.toAct} is not an active player`);
  }
  return problems;
}

/** A view must never contain another player's hole cards unless they were shown at showdown. */
export function checkView(s: HandState, view: TableView, viewerId: string | null): string[] {
  const shown = new Set((s.result?.shown ?? []).map((h) => h.seatNo));
  const text = JSON.stringify(view);
  const problems: string[] = [];
  for (const x of s.seats) {
    if (x.playerId === viewerId || shown.has(x.seatNo)) continue;
    for (const card of x.hole) {
      if (text.includes(`"${card}"`)) problems.push(`viewer ${viewerId ?? "spectator"} can see ${x.playerId}'s ${card}`);
    }
  }
  for (const card of [...s.deck, ...s.burned]) {
    if (text.includes(`"${card}"`)) problems.push(`viewer ${viewerId ?? "spectator"} can see undealt/burned ${card}`);
  }
  return problems;
}
