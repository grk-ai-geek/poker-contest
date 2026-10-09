// Game server entry point (design.md §6). M1: health check only; tables and WebSocket arrive in M3.
import { createServer } from "node:http";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const port = Number(process.env.GAME_PORT ?? 4000);
const startedAt = new Date();

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, startedAt: startedAt.toISOString(), tables: 0 }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, () => console.log(`[game] listening on http://localhost:${port}`));
