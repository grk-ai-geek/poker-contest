import { describe, expect, it } from "vitest";
import { clockwiseAfter, initialPositions, nextPositions } from "@/lib/poker/positions";

describe("initialPositions", () => {
  it("3+ players: SB and BB follow the button", () => {
    expect(initialPositions([1, 4, 7], 4)).toEqual({ buttonSeat: 4, sbSeat: 7, bbSeat: 1 });
  });
  it("heads-up: the button is the small blind", () => {
    expect(initialPositions([3, 8], 8)).toEqual({ buttonSeat: 8, sbSeat: 8, bbSeat: 3 });
  });
  it("rejects an empty button seat and single players", () => {
    expect(() => initialPositions([1, 2], 5)).toThrow();
    expect(() => initialPositions([1], 1)).toThrow();
  });
});

describe("nextPositions (dead-button rule)", () => {
  it("moves everything one seat when nobody busts", () => {
    expect(nextPositions({ buttonSeat: 1, sbSeat: 2, bbSeat: 3 }, [1, 2, 3, 4])).toEqual({ buttonSeat: 2, sbSeat: 3, bbSeat: 4 });
  });
  it("dead button: the SB player busted, the button stays on the empty seat", () => {
    expect(nextPositions({ buttonSeat: 1, sbSeat: 2, bbSeat: 3 }, [1, 3, 4])).toEqual({ buttonSeat: 2, sbSeat: 3, bbSeat: 4 });
  });
  it("dead small blind: the BB player busted, nobody posts the SB", () => {
    expect(nextPositions({ buttonSeat: 1, sbSeat: 2, bbSeat: 3 }, [1, 2, 4])).toEqual({ buttonSeat: 2, sbSeat: 3, bbSeat: 4 });
  });
  it("the big blind skips empty seats and wraps around", () => {
    expect(nextPositions({ buttonSeat: 5, sbSeat: 7, bbSeat: 9 }, [2, 5, 7, 9])).toEqual({ buttonSeat: 7, sbSeat: 9, bbSeat: 2 });
  });
  it("down to heads-up: the BB moves on, the other player gets button + SB", () => {
    expect(nextPositions({ buttonSeat: 1, sbSeat: 2, bbSeat: 3 }, [1, 3])).toEqual({ buttonSeat: 3, sbSeat: 3, bbSeat: 1 });
  });
  it("heads-up alternates the big blind", () => {
    let p = initialPositions([1, 2], 1);
    const bbs = [p.bbSeat];
    for (let i = 0; i < 3; i++) bbs.push((p = nextPositions(p, [1, 2])).bbSeat);
    expect(bbs).toEqual([2, 1, 2, 1]);
  });
  it("with no busts, every player pays the big blind exactly once per orbit", () => {
    const seats = [1, 3, 4, 6, 9];
    let p = initialPositions(seats, 3);
    const bbs: number[] = [];
    for (let i = 0; i < seats.length * 2; i++) {
      bbs.push(p.bbSeat);
      p = nextPositions(p, seats);
    }
    for (const seat of seats) expect(bbs.filter((b) => b === seat)).toHaveLength(2);
  });
});

describe("clockwiseAfter", () => {
  it("starts after the given seat and wraps", () => {
    expect(clockwiseAfter([{ seatNo: 2 }, { seatNo: 5 }, { seatNo: 8 }], 5).map((x) => x.seatNo)).toEqual([8, 2, 5]);
  });
});
