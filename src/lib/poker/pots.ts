// Main and side pots (design.md §5.6).

export type Pot = { amount: number; eligible: number[] };

export type Contribution = { seatNo: number; amount: number; folded: boolean };

/**
 * Splits everyone's chips into pots. Each distinct amount put in by a player still in the hand
 * closes a pot that only players who put in at least that much can win.
 * Folded players' chips stay in the pots, but they are never eligible.
 * Dead money (antes) goes into the main pot.
 */
export function buildPots(contributions: readonly Contribution[], deadMoney = 0): Pot[] {
  const live = contributions.filter((c) => !c.folded);
  const levels = [...new Set(live.map((c) => c.amount).filter((a) => a > 0))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = contributions.reduce((sum, c) => sum + Math.min(c.amount, level) - Math.min(c.amount, prev), 0);
    const eligible = live.filter((c) => c.amount >= level).map((c) => c.seatNo).sort((a, b) => a - b);
    const last = pots.at(-1);
    if (last && sameSeats(last.eligible, eligible)) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }

  // Chips above the highest live amount (only possible from folded players) join the last pot.
  const leftover = contributions.reduce((sum, c) => sum + c.amount - Math.min(c.amount, prev), 0);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: live.map((c) => c.seatNo).sort((a, b) => a - b) });
  }

  if (deadMoney > 0) {
    if (pots.length) pots[0].amount += deadMoney;
    else pots.push({ amount: deadMoney, eligible: live.map((c) => c.seatNo).sort((a, b) => a - b) });
  }
  return pots.filter((p) => p.amount > 0);
}

function sameSeats(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
