import type { PrismaClient } from "@/generated/prisma/client";

// Dev bots (design.md §13): user rows that the game server plays automatically on practice tables.
// Never available in production.

export function botsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ENABLE_DEV_BOTS === "1";
}

const BOT_NAMES = ["Bot_Ace", "Bot_King", "Bot_Queen", "Bot_Jack", "Bot_Ten", "Bot_Nine", "Bot_Eight", "Bot_Seven"];

/** Creates (once) and returns up to `count` bot users. */
export async function ensureBots(db: PrismaClient, count: number): Promise<{ id: string; displayName: string }[]> {
  if (!botsEnabled()) throw new Error("Dev bots are disabled (ENABLE_DEV_BOTS=1, not in production).");
  const names = BOT_NAMES.slice(0, Math.min(count, BOT_NAMES.length));
  return Promise.all(
    names.map((displayName) =>
      db.user.upsert({
        where: { displayName },
        update: {},
        create: { displayName, email: `${displayName.toLowerCase()}@bots.test`, isBot: true },
        select: { id: true, displayName: true },
      }),
    ),
  );
}
