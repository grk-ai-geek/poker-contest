import "server-only";
import { headers } from "next/headers";

// Small in-memory sliding-window rate limiter for auth actions (design.md §11).
// Per server instance: good enough to stop password guessing and sign-up spam from one address.
// (Orders are limited separately in the database, see placeOrder.ts.)

type Bucket = number[]; // timestamps of recent hits
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

/** Records a hit for `key` and says whether it's allowed (≤ `limit` hits in `windowMs`). */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
  }
  recent.push(now);
  if (buckets.size >= MAX_KEYS && !buckets.has(key)) buckets.clear(); // keep memory bounded
  buckets.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}

/** The caller's IP address (first entry of X-Forwarded-For behind Vercel/proxies). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Limits for auth actions, per IP (and per email for login). */
export const AUTH_LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  loginPerEmail: { limit: 20, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  resend: { limit: 5, windowMs: 60 * 60_000 },
} as const;
