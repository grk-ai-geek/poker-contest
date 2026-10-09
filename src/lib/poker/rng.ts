import { randomInt } from "node:crypto";

/** Returns a whole number in [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

/** Production shuffling: cryptographically secure (design.md §5.1). Server only. */
export const cryptoRng: Rng = (maxExclusive) => randomInt(maxExclusive);

/** Deterministic PRNG (mulberry32) for tests, the simulator and dev bots. Never for real deals. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  };
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
