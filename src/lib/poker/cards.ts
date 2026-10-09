// Cards are 2-character strings: rank (23456789TJQKA) + suit (c d h s), e.g. "Ah", "Tc".

export type Card = string;

export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";

const RANK_NAMES = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const SUIT_NAMES: Record<string, string> = { c: "clubs", d: "diamonds", h: "hearts", s: "spades" };

/** All 52 cards in a fixed order (2c, 2d, 2h, 2s, 3c, …). */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

export function isCard(value: unknown): value is Card {
  return typeof value === "string" && value.length === 2 && RANKS.includes(value[0]) && SUITS.includes(value[1]);
}

/** 2 … 14 (Ace high). */
export function rankValue(card: Card): number {
  return RANKS.indexOf(card[0]) + 2;
}

export function suitOf(card: Card): string {
  return card[1];
}

/** "Ace", "Ten", … for a rank value 2–14; plural gives "Aces", "Sixes". */
export function rankName(value: number, plural = false): string {
  const name = RANK_NAMES[value - 2];
  if (!plural) return name;
  return name === "Six" ? "Sixes" : `${name}s`;
}

/** Screen-reader label: "Ace of hearts". */
export function cardLabel(card: Card): string {
  return `${rankName(rankValue(card))} of ${SUIT_NAMES[suitOf(card)]}`;
}
