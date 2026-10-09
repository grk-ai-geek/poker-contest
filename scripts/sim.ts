// Usage: npm run sim -- --hands 100000 --seed 42 [--views]
import { simulate } from "../src/lib/poker/sim";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const hands = arg("hands", 100_000);
const seed = arg("seed", Date.now() % 1_000_000);
const checkViews = process.argv.includes("--views");

const started = performance.now();
const stats = simulate({ hands, seed, checkViews });
const seconds = ((performance.now() - started) / 1000).toFixed(1);

console.log(`seed ${seed}${checkViews ? " (with view leak checks)" : ""}: ${stats.hands} hands at ${stats.tables} tables, ${stats.actions} actions in ${seconds}s`);
console.log(`  showdowns ${stats.showdowns} · side pots ${stats.sidePots} · split pots ${stats.splitPots} · all-in run-outs ${stats.allInRunouts}`);
if (stats.problems.length) {
  console.error(`\nFAILED: ${stats.problems.length} problem(s)`);
  for (const p of stats.problems.slice(0, 20)) console.error(`  ${p}`);
  process.exit(1);
}
console.log("All invariants held.");
