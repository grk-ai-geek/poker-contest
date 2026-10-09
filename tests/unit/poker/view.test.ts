import { describe, expect, it } from "vitest";
import { checkView } from "@/lib/poker/invariants";
import { simulate } from "@/lib/poker/sim";
import { viewFor } from "@/lib/poker/view";
import { deal, play } from "./helpers";

const THREE = { buttonSeat: 1, sbSeat: 2, bbSeat: 3 };
const holes = { 1: ["As", "Ad"], 2: ["Ks", "Kd"], 3: ["Qs", "Qd"] } as Record<number, [string, string]>;
const board = ["2c", "7d", "9h", "Js", "4c"];

describe("viewFor", () => {
  it("a player sees only their own hole cards", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE, holes, board });
    const v = viewFor(s, "p2");
    expect(v.seats.map((x) => x.cards)).toEqual([null, ["Ks", "Kd"], null]);
    expect(v.you).toEqual({ seatNo: 2, legal: null });
    expect(checkView(s, v, "p2")).toEqual([]);
  });

  it("the player to act gets their legal actions", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE });
    expect(viewFor(s, "p1").you!.legal).toMatchObject({ toCall: 100, call: 100, check: false });
  });

  it("spectators see no hole cards and the deck never leaves the engine", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE, holes, board });
    const v = viewFor(s, null);
    expect(v.seats.every((x) => x.cards === null)).toBe(true);
    expect(v.you).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/"deck"|"burned"|"initialDeck"|"hole"/);
    expect(checkView(s, v, null)).toEqual([]);
  });

  it("folded hands stay hidden; hands shown at showdown become visible", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE, holes, board });
    s = play(s, [1, "f"], [2, "c"], [3, "x"]);
    for (let i = 0; i < 3; i++) s = play(s, [2, "x"], [3, "x"]);
    const v = viewFor(s, null);
    expect(v.seats.map((x) => x.cards)).toEqual([null, ["Ks", "Kd"], ["Qs", "Qd"]]);
    expect(JSON.stringify(v)).not.toContain('"As"');
    expect(checkView(s, v, null)).toEqual([]);
  });

  it("pots show finished streets; bets in front of players are separate", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE });
    s = play(s, [1, "c"], [2, "c"], [3, "x"], [2, "b200"]);
    const v = viewFor(s, null);
    expect(v.pots).toEqual([300]);
    expect(v.totalPot).toBe(500);
    expect(v.seats.find((x) => x.seatNo === 2)!.bet).toBe(200);
  });
});

describe("random games (seeded)", () => {
  it.each([1, 2, 3])("seed %i: 1,500 hands, invariants and views checked after every action", (seed) => {
    const stats = simulate({ hands: 1500, seed, checkViews: true });
    expect(stats.problems).toEqual([]);
    expect(stats.sidePots).toBeGreaterThan(0);
    expect(stats.splitPots).toBeGreaterThan(0);
  }, 60_000);

  it("20,000 hands without view checks", () => {
    const stats = simulate({ hands: 20_000, seed: 7 });
    expect(stats.problems).toEqual([]);
    expect(stats.hands).toBe(20_000);
  }, 60_000);
});
