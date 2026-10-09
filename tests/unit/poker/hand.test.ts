import { describe, expect, it } from "vitest";
import { applyAction, IllegalAction, legalActions } from "@/lib/poker/hand";
import { checkHand } from "@/lib/poker/invariants";
import { deal, play, stacks } from "./helpers";

const HU = { buttonSeat: 1, sbSeat: 1, bbSeat: 2 }; // heads-up: button posts the SB
const THREE = { buttonSeat: 1, sbSeat: 2, bbSeat: 3 };
const FOUR = { buttonSeat: 1, sbSeat: 2, bbSeat: 3 };

describe("blinds and turn order", () => {
  it("heads-up: the button posts the SB, acts first pre-flop and last after the flop", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000 }, positions: HU });
    expect(stacks(s)).toEqual({ 1: 950, 2: 900 });
    expect(s.toAct).toBe(1);
    s = play(s, [1, "c"]);
    expect(s.toAct).toBe(2); // BB option
    expect(legalActions(s, 2)).toMatchObject({ check: true, call: null, raise: { kind: "raise", minTo: 200 } });
    s = play(s, [2, "x"]);
    expect(s.street).toBe("flop");
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(2);
  });

  it("3-handed: the button acts first pre-flop, the SB first after the flop", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE });
    expect(s.toAct).toBe(1);
    s = play(s, [1, "c"], [2, "c"], [3, "x"]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe(2);
    s = play(s, [2, "x"], [3, "x"], [1, "x"]);
    expect(s.street).toBe("turn");
  });

  it("an empty SB seat posts nothing (dead small blind)", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 4: 1000 }, positions: { buttonSeat: 2, sbSeat: 3, bbSeat: 4 } });
    expect(s.events.filter((e) => e.type === "post")).toEqual([{ type: "post", seatNo: 4, blind: "bb", amount: 100 }]);
    expect(s.toAct).toBe(1);
  });

  it("big-blind ante: the BB pays it as dead money in the main pot", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE, level: { sb: 50, bb: 100, ante: 100 } });
    expect(stacks(s)[3]).toBe(800);
    expect(s.deadMoney).toBe(100);
    expect(s.seats.find((x) => x.seatNo === 3)!.bet).toBe(100); // the ante is not a live bet
  });

  it("a short big blind pays the blind before the ante", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 3: 120 }, positions: THREE, level: { sb: 50, bb: 100, ante: 100 } });
    const bb = s.seats.find((x) => x.seatNo === 3)!;
    expect(bb.bet).toBe(100);
    expect(s.deadMoney).toBe(20);
    expect(bb.status).toBe("allin");
  });
});

describe("raising rules", () => {
  it("minimum raise is the last full raise size", () => {
    let s = deal({ stacks: { 1: 5000, 2: 5000, 3: 5000 }, positions: THREE });
    expect(legalActions(s, 1)!.raise).toEqual({ kind: "raise", minTo: 200, maxTo: 5000 });
    expect(() => applyAction(s, 1, { type: "raise", toAmount: 150 })).toThrow(IllegalAction);
    s = play(s, [1, "r300"]); // raise of 200
    expect(legalActions(s, 2)!.raise!.minTo).toBe(500);
    s = play(s, [2, "r800"]); // raise of 500
    expect(legalActions(s, 3)!.raise!.minTo).toBe(1300);
  });

  it("a short all-in does not reopen raising for players who already acted", () => {
    let s = deal({ stacks: { 1: 5000, 2: 400, 3: 5000 }, positions: THREE });
    s = play(s, [1, "r300"], [2, "a"]); // SB all-in to 400: only +100, less than a full raise (200)
    expect(legalActions(s, 3)!.raise!.minTo).toBe(600); // BB hasn't acted: may raise
    s = play(s, [3, "c"]);
    const legal = legalActions(s, 1)!;
    expect(legal.call).toBe(100);
    expect(legal.raise).toBeNull(); // seat 1 already acted and faces only +100
    expect(() => applyAction(s, 1, { type: "allin" })).toThrow(/only call or fold/);
  });

  it("short all-ins that add up to a full raise do reopen raising", () => {
    let s = deal({ stacks: { 1: 400, 2: 550, 3: 5000, 4: 5000 }, positions: FOUR });
    s = play(s, [4, "r300"], [1, "a"], [2, "a"], [3, "c"]); // 300 → 400 → 550
    expect(legalActions(s, 4)!.raise).not.toBeNull(); // faces +250 ≥ 200
  });

  it("bet vs raise: you bet into an empty street and raise a bet", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000 }, positions: HU });
    expect(() => applyAction(s, 1, { type: "bet", toAmount: 300 })).toThrow(/can't bet/);
    s = play(s, [1, "c"], [2, "x"]);
    expect(legalActions(s, 2)!.raise).toEqual({ kind: "bet", minTo: 100, maxTo: 900 });
    expect(() => applyAction(s, 2, { type: "raise", toAmount: 300 })).toThrow(/can't raise/);
  });

  it("rejects out-of-turn actions, checking a bet, and bad amounts", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE });
    expect(() => applyAction(s, 2, { type: "call" })).toThrow(expect.objectContaining({ code: "not_your_turn" }));
    expect(() => applyAction(s, 1, { type: "check" })).toThrow(expect.objectContaining({ code: "cannot_check" }));
    expect(() => applyAction(s, 1, { type: "raise", toAmount: 250.5 })).toThrow(expect.objectContaining({ code: "bad_amount" }));
    expect(() => applyAction(s, 1, { type: "raise", toAmount: 5000 })).toThrow(expect.objectContaining({ code: "bad_amount" }));
  });

  it("no raising when everyone else is all-in", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 300 }, positions: THREE });
    s = play(s, [1, "f"], [2, "r400"], [3, "a"]); // BB all-in for 300, less than the bet
    expect(s.street).toBe("showdown"); // nobody left to act: the SB's extra 100 comes back
    expect(s.events).toContainEqual({ type: "uncalled", seatNo: 2, amount: 100 });
  });
});

describe("hand endings", () => {
  it("everyone folds: the uncalled bet comes back, no cards are shown", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000 }, positions: HU });
    s = play(s, [1, "c"], [2, "x"], [2, "b500"], [1, "f"]);
    expect(s.ended).toBe(true);
    expect(s.events).toContainEqual({ type: "uncalled", seatNo: 2, amount: 500 });
    expect(s.result).toEqual({ showdown: false, shown: [], awards: [{ amount: 200, eligible: [2], winners: [{ seatNo: 2, amount: 200 }], handName: null }] });
    expect(stacks(s)).toEqual({ 1: 900, 2: 1100 });
  });

  it("folds to the big blind: BB wins the small blind", () => {
    const s = play(deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE }), [1, "f"], [2, "f"]);
    expect(stacks(s)).toEqual({ 1: 1000, 2: 950, 3: 1050 });
  });

  it("all-in and called: the board runs out and the best hand wins", () => {
    let s = deal({
      stacks: { 1: 1000, 2: 300 },
      positions: HU,
      holes: { 1: ["As", "Ad"], 2: ["Ks", "Kd"] },
      board: ["2c", "7d", "9h", "Js", "4c"],
    });
    s = play(s, [1, "a"], [2, "c"]);
    expect(s.ended).toBe(true);
    expect(s.board).toEqual(["2c", "7d", "9h", "Js", "4c"]);
    expect(s.events).toContainEqual({ type: "uncalled", seatNo: 1, amount: 700 });
    expect(stacks(s)).toEqual({ 1: 1300, 2: 0 });
    expect(s.result!.awards[0].handName).toBe("Pair of Aces");
  });

  it("a big blind all-in for less: the caller's excess comes back", () => {
    let s = deal({ stacks: { 1: 1000, 2: 70 }, positions: HU, holes: { 1: ["2s", "3d"], 2: ["Ks", "Kd"] }, board: ["As", "8d", "9h", "Js", "4c"] });
    expect(s.toAct).toBe(1);
    expect(legalActions(s, 1)).toMatchObject({ call: 50, raise: null });
    s = play(s, [1, "c"]);
    expect(s.ended).toBe(true);
    expect(stacks(s)).toEqual({ 1: 930, 2: 140 });
  });

  it("a small blind all-in by posting: nobody acts and the hand plays out", () => {
    const s = deal({ stacks: { 1: 30, 2: 1000 }, positions: HU });
    expect(s.ended).toBe(true);
    expect(s.events).toContainEqual({ type: "uncalled", seatNo: 2, amount: 70 });
    expect(s.result!.awards.reduce((sum, a) => sum + a.amount, 0)).toBe(60);
  });
});

describe("pots", () => {
  it("three different all-ins make a main pot and a side pot", () => {
    let s = deal({
      stacks: { 1: 100, 2: 300, 3: 600 },
      positions: THREE,
      level: { sb: 10, bb: 20, ante: 0 },
      holes: { 1: ["As", "Ad"], 2: ["Ks", "Kd"], 3: ["Qs", "Qd"] },
      board: ["2c", "7d", "9h", "Js", "4c"],
    });
    s = play(s, [1, "a"], [2, "a"], [3, "c"]);
    expect(s.ended).toBe(true);
    expect(s.result!.awards.map((a) => ({ amount: a.amount, eligible: a.eligible, winners: a.winners }))).toEqual([
      { amount: 300, eligible: [1, 2, 3], winners: [{ seatNo: 1, amount: 300 }] },
      { amount: 400, eligible: [2, 3], winners: [{ seatNo: 2, amount: 400 }] },
    ]);
    expect(stacks(s)).toEqual({ 1: 300, 2: 400, 3: 300 });
  });

  it("split pot: the odd chip goes to the first winner left of the button", () => {
    let s = deal({
      stacks: { 1: 1000, 2: 1000, 3: 1000 },
      positions: THREE,
      level: { sb: 25, bb: 50, ante: 25 },
      board: ["As", "Ks", "Qs", "Js", "Ts"], // royal flush on the board: everyone splits
    });
    s = play(s, [1, "f"], [2, "c"], [3, "x"], [2, "x"], [3, "x"], [2, "x"], [3, "x"], [2, "x"], [3, "x"]);
    expect(s.result!.awards).toEqual([
      { amount: 125, eligible: [2, 3], winners: [{ seatNo: 2, amount: 63 }, { seatNo: 3, amount: 62 }], handName: "Royal flush" },
    ]);
    expect(stacks(s)).toEqual({ 1: 1000, 2: 1013, 3: 987 });
  });

  it("folded players' chips stay in the pot", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE, holes: { 2: ["As", "Ad"], 3: ["7c", "2d"] }, board: ["Kc", "8d", "9h", "Js", "4c"] });
    s = play(s, [1, "r300"], [2, "c"], [3, "c"], [2, "b200"], [3, "c"], [1, "f"], [2, "x"], [3, "x"], [2, "x"], [3, "x"]);
    expect(s.result!.awards).toEqual([{ amount: 1300, eligible: [2, 3], winners: [{ seatNo: 2, amount: 1300 }], handName: "Pair of Aces" }]);
  });
});

describe("showdown", () => {
  it("the river's last aggressor shows first", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE });
    s = play(s, [1, "c"], [2, "c"], [3, "x"], [2, "x"], [3, "x"], [1, "x"], [2, "x"], [3, "x"], [1, "x"], [2, "x"], [3, "b100"], [1, "c"], [2, "c"]);
    expect(s.result!.shown.map((h) => h.seatNo)).toEqual([3, 1, 2]);
  });

  it("without a river bet, the first player left of the button shows first", () => {
    let s = deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE });
    s = play(s, [1, "c"], [2, "c"], [3, "x"]);
    for (let i = 0; i < 3; i++) s = play(s, [2, "x"], [3, "x"], [1, "x"]);
    expect(s.result!.shown.map((h) => h.seatNo)).toEqual([2, 3, 1]);
    expect(s.events.filter((e) => e.type === "show")).toHaveLength(3);
  });
});

describe("stats flags and history", () => {
  it("records VPIP and PFR; posting a blind doesn't count", () => {
    const s = play(deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE }), [1, "r300"], [2, "c"], [3, "f"]);
    const flags = Object.fromEntries(s.seats.map((x) => [x.seatNo, [x.vpip, x.pfr]]));
    expect(flags).toEqual({ 1: [true, true], 2: [true, false], 3: [false, false] });
  });

  it("logs every action with the amount added and the new total", () => {
    const s = play(deal({ stacks: { 1: 1000, 2: 1000, 3: 1000 }, positions: THREE }), [1, "r300"], [2, "c"]);
    expect(s.events.filter((e) => e.type === "action")).toEqual([
      { type: "action", seatNo: 1, street: "preflop", action: "raise", amount: 300, toAmount: 300, allIn: false },
      { type: "action", seatNo: 2, street: "preflop", action: "call", amount: 250, toAmount: 300, allIn: false },
    ]);
  });

  it("actions after the hand ends are refused", () => {
    const s = play(deal({ stacks: { 1: 1000, 2: 1000 }, positions: HU }), [1, "f"]);
    expect(() => applyAction(s, 2, { type: "check" })).toThrow(expect.objectContaining({ code: "hand_over" }));
  });

  it("the original state is never changed (pure function)", () => {
    const s = deal({ stacks: { 1: 1000, 2: 1000 }, positions: HU });
    const before = JSON.stringify(s);
    play(s, [1, "r300"], [2, "c"]);
    expect(JSON.stringify(s)).toBe(before);
    expect(checkHand(s, 2000)).toEqual([]);
  });
});
