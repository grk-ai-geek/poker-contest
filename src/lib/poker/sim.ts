import { fullDeck } from "./cards";
import { applyAction, legalActions, startHand } from "./hand";
import { checkHand, checkView } from "./invariants";
import { initialPositions, nextPositions } from "./positions";
import { shuffle, seededRng, type Rng } from "./rng";
import type { ActionInput, BlindLevel, HandState, LegalActions, Positions } from "./types";
import { viewFor } from "./view";

// Random-play simulator (design.md §17): plays many hands with random legal actions
// and checks every invariant after every action. Also the brain of the dev bots.

/** A random but plausible action: mostly check/call, sometimes fold, raise or shove. */
export function randomAction(legal: LegalActions, rng: Rng): ActionInput {
  const r = rng(100);
  if (legal.call !== null && r < 15) return { type: "fold" };
  if (legal.raise && r >= 80) {
    if (r >= 96) return { type: "allin" };
    const { kind, minTo, maxTo } = legal.raise;
    const span = Math.min(maxTo - minTo, minTo * 3);
    return { type: kind, toAmount: minTo + (span > 0 ? rng(span + 1) : 0) };
  }
  return legal.check ? { type: "check" } : { type: "call" };
}

export type SimOptions = {
  hands: number;
  seed: number;
  /** Also check every player's and a spectator's view for leaks after every action (slower). */
  checkViews?: boolean;
};

export type SimStats = {
  hands: number;
  actions: number;
  showdowns: number;
  sidePots: number;
  splitPots: number;
  allInRunouts: number;
  tables: number;
  problems: string[];
};

type TablePlayer = { seatNo: number; playerId: string; stack: number };

export function simulate({ hands, seed, checkViews = false }: SimOptions): SimStats {
  const rng = seededRng(seed);
  const stats: SimStats = { hands: 0, actions: 0, showdowns: 0, sidePots: 0, splitPots: 0, allInRunouts: 0, tables: 0, problems: [] };

  let players: TablePlayer[] = [];
  let positions: Positions | null = null;
  let level: BlindLevel = { sb: 50, bb: 100, ante: 0 };
  let handsAtTable = 0;

  const newTable = () => {
    stats.tables++;
    const count = 2 + rng(8);
    const seatNos = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng).slice(0, count);
    players = seatNos.map((seatNo, i) => ({ seatNo, playerId: `p${stats.tables}_${i}`, stack: 1 + rng(20_000) }));
    const bb = 100 * (1 + rng(3));
    level = { sb: bb / 2, bb, ante: rng(2) ? bb : 0 };
    positions = initialPositions(seatNos, seatNos[rng(seatNos.length)]);
    handsAtTable = 0;
  };

  const fail = (state: HandState, problems: string[]) => {
    for (const p of problems) stats.problems.push(`seed ${seed}, table ${stats.tables}, hand ${state.handNo}: ${p}`);
  };

  const check = (state: HandState, total: number) => {
    const problems = checkHand(state, total);
    if (checkViews) {
      for (const viewer of [...state.seats.map((x) => x.playerId), null]) problems.push(...checkView(state, viewFor(state, viewer), viewer));
    }
    if (problems.length) fail(state, problems);
    return problems.length === 0;
  };

  while (stats.hands < hands && stats.problems.length === 0) {
    if (players.length < 2) newTable();
    // Blinds go up every 25 hands so tables finish.
    if (handsAtTable > 0 && handsAtTable % 25 === 0) level = { sb: level.sb * 2, bb: level.bb * 2, ante: level.ante * 2 };

    const total = players.reduce((sum, p) => sum + p.stack, 0);
    let state = startHand({ handNo: ++handsAtTable, level, positions: positions!, players, deck: shuffle(fullDeck(), rng) });
    if (!check(state, total)) break;

    let guard = 0;
    while (!state.ended) {
      const seatNo = state.toAct!;
      const legal = legalActions(state, seatNo)!;
      state = applyAction(state, seatNo, randomAction(legal, rng));
      stats.actions++;
      if (!check(state, total)) break;
      if (++guard > 1000) {
        fail(state, ["hand did not finish within 1000 actions"]);
        break;
      }
    }
    if (stats.problems.length) break;

    stats.hands++;
    const result = state.result!;
    if (result.showdown) stats.showdowns++;
    if (result.awards.length > 1) stats.sidePots++;
    if (result.awards.some((a) => a.winners.length > 1)) stats.splitPots++;
    if (result.showdown && state.events.filter((e) => e.type === "street").length > 0 && state.seats.filter((x) => x.status === "active").length <= 1) {
      stats.allInRunouts++;
    }

    players = state.seats.filter((x) => x.stack > 0).map((x) => ({ seatNo: x.seatNo, playerId: x.playerId, stack: x.stack }));
    positions = players.length >= 2 ? nextPositions(state.positions, players.map((p) => p.seatNo)) : null;
  }
  return stats;
}
