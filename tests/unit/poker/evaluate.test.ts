import { describe, expect, it } from "vitest";
import { cardLabel, fullDeck } from "@/lib/poker/cards";
import { CATEGORIES, evaluate, score5 } from "@/lib/poker/evaluate";

const ev = (cards: string) => evaluate(cards.split(" "));

describe("evaluate: names and categories", () => {
  it.each([
    ["Ah Kh Qh Jh Th 2c 3d", "Straight flush", "Royal flush"],
    ["9s 8s 7s 6s 5s Ad Ac", "Straight flush", "Straight flush, Nine high"],
    ["5d 4d 3d 2d Ad Kc Ks", "Straight flush", "Straight flush, Five high"], // steel wheel
    ["Qc Qd Qh Qs 2c 3d 9h", "Four of a kind", "Four of a kind, Queens"],
    ["Kc Kd Ks 7h 7s 2c 3d", "Full house", "Full house, Kings over Sevens"],
    ["Ah Jh 8h 4h 2h Kc Kd", "Flush", "Flush, Ace high"],
    ["Tc 9d 8h 7s 6c 2d 2h", "Straight", "Straight, Ten high"],
    ["Ac 2d 3h 4s 5c Kd Kh", "Straight", "Straight, Five high"], // wheel
    ["6c 6d 6h Ks 2c 8d 9h", "Three of a kind", "Three of a kind, Sixes"],
    ["Ac Ad 9h 9s 2c 3d 5h", "Two pair", "Two pair, Aces and Nines"],
    ["Jc Jd 9h 7s 2c 3d 4h", "Pair", "Pair of Jacks"],
    ["Ac Qd 9h 7s 2c 3d 5h", "High card", "High card, Ace"],
  ])("%s → %s", (cards, category, name) => {
    const r = ev(cards);
    expect(r.category).toBe(category);
    expect(r.name).toBe(name);
    expect(r.best5).toHaveLength(5);
  });

  it("categories rank in the right order", () => {
    const order = [
      "Ac Qd 9h 7s 2c", "Jc Jd 9h 7s 2c", "Ac Ad 9h 9s 2c", "6c 6d 6h Ks 2c", "Tc 9d 8h 7s 6c",
      "Ah Jh 8h 4h 2h", "Kc Kd Ks 7h 7s", "Qc Qd Qh Qs 2c", "9s 8s 7s 6s 5s",
    ].map((h) => ev(h));
    order.forEach((r, i) => expect(r.category).toBe(CATEGORIES[i]));
    for (let i = 1; i < order.length; i++) expect(order[i].score).toBeGreaterThan(order[i - 1].score);
  });
});

describe("evaluate: tie-breaks", () => {
  it("kicker decides between equal pairs", () => {
    expect(ev("Ac Ad Kh 7s 2c").score).toBeGreaterThan(ev("Ah As Qh 7d 2d").score);
  });
  it("wheel is the lowest straight", () => {
    expect(ev("6c 5d 4h 3s 2c").score).toBeGreaterThan(ev("Ac 5d 4h 3s 2c").score);
  });
  it("two pair compares the high pair, then the low pair, then the kicker", () => {
    expect(ev("Ac Ad 3h 3s 2c").score).toBeGreaterThan(ev("Kc Kd Qh Qs Jc").score);
    expect(ev("Ac Ad 9h 9s 2c").score).toBeGreaterThan(ev("Ah As 8h 8s Kc").score);
    expect(ev("Ac Ad 9h 9s 3c").score).toBeGreaterThan(ev("Ah As 9d 9c 2c").score);
  });
  it("full house compares trips first", () => {
    expect(ev("3c 3d 3h 2s 2c").score).toBeGreaterThan(ev("2h 2d 2c As Ac").score);
  });
  it("flush compares all five cards", () => {
    expect(ev("Ah Jh 8h 4h 3h").score).toBeGreaterThan(ev("As Js 8s 4s 2s").score);
  });
  it("identical ranks in different suits split", () => {
    expect(ev("Ac Kd Qh Js 9c").score).toBe(ev("Ad Kh Qs Jc 9d").score);
  });
});

describe("evaluate: picks the best five of seven", () => {
  it("flush beats the straight also on the board", () => {
    const r = ev("9h 8h 7h 6c 5h 2h Kd");
    expect(r.category).toBe("Flush");
    expect(r.name).toBe("Flush, Nine high");
  });
  it("three pairs: uses the two best pairs and the best kicker", () => {
    const r = ev("Kc Kd 9h 9s 4c 4d Qh");
    expect(r.name).toBe("Two pair, Kings and Nines");
    expect(r.best5.map((c) => c[0]).join("")).toBe("KK99Q");
  });
  it("two trips make a full house with the higher trips", () => {
    expect(ev("8c 8d 8h 5s 5c 5d Ah").name).toBe("Full house, Eights over Fives");
  });
  it("orders the wheel's ace last", () => {
    expect(ev("Ac 2d 3h 4s 5c Kd Qh").best5.map((c) => c[0]).join("")).toBe("5432A");
  });
});

describe("score5 against the known 5-card distribution", () => {
  // All 2,598,960 five-card hands; the counts per category are standard reference values.
  it("matches the reference counts exactly", () => {
    const deck = fullDeck();
    const counts = new Array(9).fill(0);
    const n = deck.length;
    const five = ["", "", "", "", ""];
    for (let a = 0; a < n; a++) {
      five[0] = deck[a];
      for (let b = a + 1; b < n; b++) {
        five[1] = deck[b];
        for (let c = b + 1; c < n; c++) {
          five[2] = deck[c];
          for (let d = c + 1; d < n; d++) {
            five[3] = deck[d];
            for (let e = d + 1; e < n; e++) {
              five[4] = deck[e];
              counts[score5(five).cat]++;
            }
          }
        }
      }
    }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  }, 60_000);
});

describe("cards", () => {
  it("labels cards for screen readers", () => {
    expect(cardLabel("Ah")).toBe("Ace of hearts");
    expect(cardLabel("Tc")).toBe("Ten of clubs");
  });
});
