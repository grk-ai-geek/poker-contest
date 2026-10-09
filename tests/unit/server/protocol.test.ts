import { describe, expect, it } from "vitest";
import { signGameToken, verifyGameToken } from "@/lib/gameToken";
import { parseClientMessage } from "@/lib/protocol/messages";

const SECRET = "x".repeat(40);
const who = { userId: "u1", name: "river_rat", role: "USER" as const };

describe("game tokens", () => {
  it("round-trips the identity", async () => {
    const token = await signGameToken(who, SECRET);
    expect(await verifyGameToken(token, SECRET)).toEqual(who);
  });
  it("expires after 5 minutes", async () => {
    const now = Date.now();
    const token = await signGameToken(who, SECRET, now);
    expect(await verifyGameToken(token, SECRET, now + 4 * 60_000)).toEqual(who);
    expect(await verifyGameToken(token, SECRET, now + 6 * 60_000)).toBeNull();
  });
  it("rejects a different secret and tampered tokens", async () => {
    const token = await signGameToken(who, SECRET);
    expect(await verifyGameToken(token, "y".repeat(40))).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", name: "x", role: "ADMIN", iss: "web", aud: "game" })).toString("base64url");
    expect(await verifyGameToken(`${h}.${forged}.${s}`, SECRET)).toBeNull();
    expect(await verifyGameToken("not-a-token", SECRET)).toBeNull();
  });
  it("refuses to sign with a short secret", async () => {
    await expect(signGameToken(who, "short")).rejects.toThrow(/GAME_TOKEN_SECRET/);
  });
});

describe("client messages", () => {
  it.each([
    { t: "hello", token: "abc" },
    { t: "hello" },
    { t: "watch_table", tableId: "t1" },
    { t: "act", tableId: "t1", handNo: 3, actionId: "a1", action: { type: "fold" } },
    { t: "act", tableId: "t1", handNo: 3, actionId: "a1", action: { type: "raise", toAmount: 300 } },
    { t: "pre_action", tableId: "t1", value: null },
    { t: "ping" },
  ])("accepts %j", (msg) => {
    expect(parseClientMessage(JSON.stringify(msg)).ok).toBe(true);
  });

  it.each([
    "not json",
    JSON.stringify({ t: "launch_missiles" }),
    JSON.stringify({ t: "act", tableId: "t1", handNo: 3, actionId: "a1", action: { type: "raise" } }), // no amount
    JSON.stringify({ t: "act", tableId: "t1", handNo: 3, actionId: "a1", action: { type: "raise", toAmount: 10.5 } }),
    JSON.stringify({ t: "act", tableId: "t1", handNo: 3, actionId: "a1", action: { type: "fold", cards: ["As"] } }).replace('"fold"', '"peek"'),
    JSON.stringify({ t: "watch_table", tableId: "x".repeat(65) }),
    JSON.stringify({ t: "pre_action", tableId: "t1", value: "raise_any" }),
  ])("rejects %s", (raw) => {
    expect(parseClientMessage(raw).ok).toBe(false);
  });
});
