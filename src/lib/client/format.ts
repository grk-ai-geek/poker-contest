import { cardLabel, type Card } from "@/lib/poker/cards";
import type { HandEvent } from "@/lib/poker/types";

// Text for the table UI: chip amounts, cards and the hand log.

export function chips(n: number): string {
  return n.toLocaleString("en-US");
}

const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function rankText(card: Card): string {
  return card[0] === "T" ? "10" : card[0];
}

export function suitSymbol(card: Card): string {
  return SUIT_SYMBOL[card[1]];
}

export function isRed(card: Card): boolean {
  return card[1] === "h" || card[1] === "d";
}

/** "A♠ K♦" */
export function cardsText(cards: Card[]): string {
  return cards.map((c) => rankText(c) + suitSymbol(c)).join(" ");
}

export { cardLabel };

const STREET_NAME: Record<string, string> = { flop: "Flop", turn: "Turn", river: "River" };

/** One line of the hand log, or null for events not worth a line. */
export function eventText(e: HandEvent, nameOf: (seatNo: number) => string): string | null {
  switch (e.type) {
    case "deal":
      return null;
    case "post":
      return `${nameOf(e.seatNo)} posts ${e.blind === "sb" ? "small blind" : e.blind === "bb" ? "big blind" : "ante"} ${chips(e.amount)}`;
    case "action": {
      const who = nameOf(e.seatNo);
      const allIn = e.allIn ? " (all-in)" : "";
      if (e.action === "fold") return `${who} folds`;
      if (e.action === "check") return `${who} checks`;
      if (e.action === "call") return `${who} calls ${chips(e.amount)}${allIn}`;
      if (e.action === "bet") return `${who} bets ${chips(e.toAmount)}${allIn}`;
      return `${who} raises to ${chips(e.toAmount)}${allIn}`;
    }
    case "uncalled":
      return `${chips(e.amount)} returned to ${nameOf(e.seatNo)}`;
    case "street":
      return `${STREET_NAME[e.street] ?? e.street}: ${cardsText(e.cards)}`;
    case "show":
      return `${nameOf(e.seatNo)} shows ${cardsText(e.cards)} (${e.handName})`;
    case "award": {
      const pot = e.potIndex === 0 ? "" : " from side pot";
      return e.winners
        .map((w) => `${nameOf(w.seatNo)} wins ${chips(w.amount)}${pot}${e.handName ? ` with ${e.handName.toLowerCase()}` : ""}`)
        .join("; ");
    }
  }
}
