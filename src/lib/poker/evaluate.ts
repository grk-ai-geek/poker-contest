import { rankName, rankValue, suitOf, type Card } from "./cards";

// Hand evaluator (design.md §5.2): scores every 5-card combination and keeps the best.
// Score = category × 16⁵ + tie-break ranks in base 16, so a higher score always wins
// and equal scores are a split.

export const CATEGORIES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Evaluation = {
  score: number;
  category: Category;
  /** The five cards that make the hand, most important first. */
  best5: Card[];
  /** "Full house, Kings over Sevens" */
  name: string;
};

type Score5 = { score: number; cat: number; tiebreak: number[] };

const PLACE = [16 ** 4, 16 ** 3, 16 ** 2, 16, 1];
const CATEGORY_UNIT = 16 ** 5;

/** Scores exactly five cards. */
export function score5(cards: readonly Card[]): Score5 {
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups ordered by size, then rank: [[rank, count], …]
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let straightHigh = 0;
  if (counts.size === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // wheel: A-2-3-4-5
  }

  let cat: number;
  let tiebreak: number[];
  if (straightHigh && flush) [cat, tiebreak] = [8, [straightHigh]];
  else if (groups[0][1] === 4) [cat, tiebreak] = [7, [groups[0][0], groups[1][0]]];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [cat, tiebreak] = [6, [groups[0][0], groups[1][0]]];
  else if (flush) [cat, tiebreak] = [5, ranks];
  else if (straightHigh) [cat, tiebreak] = [4, [straightHigh]];
  else if (groups[0][1] === 3) [cat, tiebreak] = [3, groups.map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [cat, tiebreak] = [2, groups.map((g) => g[0])];
  else if (groups[0][1] === 2) [cat, tiebreak] = [1, groups.map((g) => g[0])];
  else [cat, tiebreak] = [0, ranks];

  let score = cat * CATEGORY_UNIT;
  tiebreak.forEach((r, i) => (score += r * PLACE[i]));
  return { score, cat, tiebreak };
}

const comboCache = new Map<number, number[][]>();

/** All index combinations of 5 out of n (cached). */
function combos5(n: number): number[][] {
  let list = comboCache.get(n);
  if (!list) {
    list = [];
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) list.push([a, b, c, d, e]);
    comboCache.set(n, list);
  }
  return list;
}

function handName(cat: number, tb: number[]): string {
  switch (cat) {
    case 8:
      return tb[0] === 14 ? "Royal flush" : `Straight flush, ${rankName(tb[0])} high`;
    case 7:
      return `Four of a kind, ${rankName(tb[0], true)}`;
    case 6:
      return `Full house, ${rankName(tb[0], true)} over ${rankName(tb[1], true)}`;
    case 5:
      return `Flush, ${rankName(tb[0])} high`;
    case 4:
      return `Straight, ${rankName(tb[0])} high`;
    case 3:
      return `Three of a kind, ${rankName(tb[0], true)}`;
    case 2:
      return `Two pair, ${rankName(tb[0], true)} and ${rankName(tb[1], true)}`;
    case 1:
      return `Pair of ${rankName(tb[0], true)}`;
    default:
      return `High card, ${rankName(tb[0])}`;
  }
}

/** Orders the winning five for display: biggest group first; straights high to low (wheel ace last). */
function orderBest5(cards: Card[], cat: number, tb: number[]): Card[] {
  if (cat === 8 || cat === 4) {
    const value = (c: Card) => (tb[0] === 5 && rankValue(c) === 14 ? 1 : rankValue(c));
    return [...cards].sort((a, b) => value(b) - value(a));
  }
  const count = (c: Card) => cards.filter((x) => x[0] === c[0]).length;
  return [...cards].sort((a, b) => count(b) - count(a) || rankValue(b) - rankValue(a));
}

/** Best 5-card hand from 5–7 cards. */
export function evaluate(cards: readonly Card[]): Evaluation {
  if (cards.length < 5 || cards.length > 7) throw new Error(`evaluate needs 5–7 cards, got ${cards.length}`);
  let best: Score5 | null = null;
  let bestCards: Card[] = [];
  for (const idx of combos5(cards.length)) {
    const five = idx.map((i) => cards[i]);
    const s = score5(five);
    if (!best || s.score > best.score) {
      best = s;
      bestCards = five;
    }
  }
  const { score, cat, tiebreak } = best!;
  return { score, category: CATEGORIES[cat], best5: orderBest5(bestCards, cat, tiebreak), name: handName(cat, tiebreak) };
}
