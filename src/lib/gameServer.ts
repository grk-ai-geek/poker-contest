import "server-only";

// Calls from the Next.js app to the game server's internal API (design.md §6.3), with the shared secret.

function baseUrl(): string {
  return process.env.GAME_SERVER_URL ?? "http://localhost:4000";
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET is not set.");
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Game server ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export type TableSummary = { id: string; name: string; practice: boolean; players: number };

export function devBotsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_BOTS === "1";
}

export async function createPracticeTable(opts: { bots: number; maxSeats: number }): Promise<string> {
  const { tableId } = await call<{ tableId: string }>("/internal/practice-tables", { method: "POST", body: JSON.stringify(opts) });
  return tableId;
}

export async function listTables(): Promise<TableSummary[] | null> {
  try {
    return (await call<{ tables: TableSummary[] }>("/internal/tables")).tables;
  } catch {
    return null; // game server not running
  }
}

export async function closeTable(tableId: string): Promise<void> {
  await call(`/internal/tables/${encodeURIComponent(tableId)}/close`, { method: "POST" });
}
