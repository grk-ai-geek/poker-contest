import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";

// Brand guard (design.md §3): the brand name may only appear in src/config/brand.ts,
// so a rebrand never needs code changes.
const SRC = join(process.cwd(), "src");
const ALLOWED = new Set([join("config", "brand.ts")]);
const SKIP_DIRS = new Set(["generated"]);
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|css|json|md|svg)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : files(path);
    return EXTENSIONS.test(name) ? [path] : [];
  });
}

/** "RiverKings" also catches "River Kings", "river-kings", "river_kings". */
function brandPattern(name: string): RegExp {
  const letters = name.replace(/[^a-zA-Z0-9]/g, "");
  const parts = letters.split(/(?=[A-Z])/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(parts.join("[\\s_-]?"), "i");
}

describe("brand guard", () => {
  it("brandPattern matches common spellings", () => {
    const re = brandPattern("RiverKings");
    for (const s of ["RiverKings", "River Kings", "river-kings", "RIVER_KINGS"]) expect(s).toMatch(re);
    expect("river bank kings").not.toMatch(re);
  });

  it(`"${brand.name}" appears nowhere in src/ except src/config/brand.ts`, () => {
    const re = brandPattern(brand.name);
    const offenders = files(SRC)
      .filter((f) => !ALLOWED.has(relative(SRC, f).split("/").join(sep)))
      .filter((f) => re.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });
});
