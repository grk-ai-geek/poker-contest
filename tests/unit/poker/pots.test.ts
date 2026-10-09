import { describe, expect, it } from "vitest";
import { buildPots } from "@/lib/poker/pots";

const c = (seatNo: number, amount: number, folded = false) => ({ seatNo, amount, folded });

describe("buildPots", () => {
  it("equal contributions make one pot", () => {
    expect(buildPots([c(1, 100), c(2, 100), c(3, 100)])).toEqual([{ amount: 300, eligible: [1, 2, 3] }]);
  });

  it("each smaller all-in closes a pot", () => {
    expect(buildPots([c(1, 100), c(2, 300), c(3, 600), c(4, 600)])).toEqual([
      { amount: 400, eligible: [1, 2, 3, 4] },
      { amount: 600, eligible: [2, 3, 4] },
      { amount: 600, eligible: [3, 4] },
    ]);
  });

  it("folded chips count but folded players can't win", () => {
    expect(buildPots([c(1, 500, true), c(2, 200), c(3, 800)])).toEqual([
      { amount: 600, eligible: [2, 3] },
      { amount: 900, eligible: [3] },
    ]);
  });

  it("dead money (antes) goes to the main pot", () => {
    expect(buildPots([c(1, 100), c(2, 300), c(3, 300)], 50)).toEqual([
      { amount: 350, eligible: [1, 2, 3] },
      { amount: 400, eligible: [2, 3] },
    ]);
  });

  it("chips above the highest live amount join the last pot", () => {
    expect(buildPots([c(1, 1000, true), c(2, 400), c(3, 400)])).toEqual([{ amount: 1800, eligible: [2, 3] }]);
  });

  it("totals always add up", () => {
    const contribs = [c(1, 37), c(2, 912, true), c(3, 400), c(4, 1200), c(5, 400)];
    const total = buildPots(contribs, 75).reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(37 + 912 + 400 + 1200 + 400 + 75);
  });
});
