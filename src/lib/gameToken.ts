import { jwtVerify, SignJWT } from "jose";

// Short-lived tokens that let a browser prove who it is to the game server (design.md §6.3).
// The Next.js app signs them for a logged-in user; the game server verifies them on "hello".

export type GameIdentity = { userId: string; name: string; role: "USER" | "ADMIN" };

const TTL_SECONDS = 5 * 60;
const ISSUER = "web";
const AUDIENCE = "game";

function key(secret: string | undefined = process.env.GAME_TOKEN_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("GAME_TOKEN_SECRET must be set (at least 32 characters).");
  return new TextEncoder().encode(secret);
}

export async function signGameToken(identity: GameIdentity, secret?: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ name: identity.name, role: identity.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + TTL_SECONDS)
    .sign(key(secret));
}

/** The identity in a valid token, or null for anything invalid or expired. */
export async function verifyGameToken(token: string, secret?: string, now = Date.now()): Promise<GameIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: new Date(now),
    });
    if (typeof payload.sub !== "string" || typeof payload.name !== "string") return null;
    const role = payload.role === "ADMIN" ? "ADMIN" : "USER";
    return { userId: payload.sub, name: payload.name, role };
  } catch {
    return null;
  }
}
