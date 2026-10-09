import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { hit } = await import("@/lib/rateLimit");

describe("rate limiter", () => {
  it("allows up to the limit in the window, then blocks with a retry time", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit("k1", 3, 60_000, t0 + i).ok).toBe(true);
    const blocked = hit("k1", 3, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
  });
  it("lets requests through again once old hits leave the window", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 3; i++) hit("k2", 3, 60_000, t0);
    expect(hit("k2", 3, 60_000, t0 + 59_999).ok).toBe(false);
    expect(hit("k2", 3, 60_000, t0 + 60_000).ok).toBe(true);
  });
  it("keeps keys independent", () => {
    for (let i = 0; i < 3; i++) hit("ip-a", 3, 60_000, 3_000_000);
    expect(hit("ip-a", 3, 60_000, 3_000_001).ok).toBe(false);
    expect(hit("ip-b", 3, 60_000, 3_000_001).ok).toBe(true);
  });
});
