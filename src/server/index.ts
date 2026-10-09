// Game server entry point (design.md §6). Run with `npm run server` (dev) or `npm run server:start`.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

async function main() {
  // Imported after dotenv so DATABASE_URL is set.
  const { db } = await import("@/lib/db");
  const { startGameServer } = await import("./app");

  const game = await startGameServer({
    db,
    port: Number(process.env.GAME_PORT ?? 4000),
    internalSecret: required("INTERNAL_API_SECRET"),
    gameTokenSecret: required("GAME_TOKEN_SECRET"),
    allowedOrigins: (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  });
  console.log(`[game] listening on http://localhost:${game.port} (WebSocket /ws)`);

  const shutdown = async (signal: string) => {
    console.log(`[game] ${signal}: shutting down`);
    await game.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
