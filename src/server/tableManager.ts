import { EventEmitter } from "node:events";
import type { PrismaClient } from "@/generated/prisma/client";
import type { BlindLevel } from "@/lib/poker/types";
import type { GameIdentity } from "@/lib/gameToken";
import { botsEnabled, ensureBots } from "./bots";
import { TableRuntime, type TableConfig, type TableError, type TableSnapshot, type TableStore } from "./tableRuntime";

// All tables running on this game server (design.md §6.1).

type TableRow = {
  id: string;
  contestId: string | null;
  name: string;
  maxSeats: number;
  level: unknown;
  startingStack: number;
  actionSeconds: number;
  timeBankSeconds: number;
  snapshot: unknown;
};

export type ManagerOptions = {
  /** Overrides for tests (fast clocks). */
  tableDefaults?: Partial<Pick<TableConfig, "betweenHandsMs" | "autoActMs" | "botDelayMs" | "actionMs" | "timeBankMs">>;
};

export class TableManager extends EventEmitter<{ change: [tableId: string] }> {
  private tables = new Map<string, TableRuntime>();

  constructor(
    private readonly db: PrismaClient,
    private readonly store: TableStore,
    private readonly options: ManagerOptions = {},
  ) {
    super();
  }

  get(tableId: string): TableRuntime | undefined {
    return this.tables.get(tableId);
  }

  all(): TableRuntime[] {
    return [...this.tables.values()];
  }

  private configFor(row: TableRow): TableConfig {
    const level = row.level as BlindLevel;
    return {
      tableId: row.id,
      contestId: row.contestId,
      name: row.name,
      maxSeats: row.maxSeats,
      practice: row.contestId === null,
      level: () => level,
      actionMs: row.actionSeconds * 1000,
      timeBankMs: row.timeBankSeconds * 1000,
      ...this.options.tableDefaults,
    };
  }

  private add(runtime: TableRuntime): TableRuntime {
    this.tables.set(runtime.id, runtime);
    runtime.on("change", () => this.emit("change", runtime.id));
    return runtime;
  }

  /** On startup: rebuild every open table from its last snapshot (design.md §6.7). */
  async restoreAll(): Promise<number> {
    const rows = await this.db.table.findMany({ where: { status: "OPEN" } });
    for (const row of rows) {
      if (this.tables.has(row.id)) continue;
      const config = this.configFor(row);
      const snapshot = row.snapshot as TableSnapshot | null;
      this.add(snapshot ? TableRuntime.restore(config, this.store, snapshot) : new TableRuntime(config, this.store));
    }
    return rows.length;
  }

  /** Dev only: a cash-style practice table with bots in some seats. */
  async createPracticeTable(opts: { bots?: number; maxSeats?: number; bb?: number; startingStack?: number } = {}): Promise<TableRuntime> {
    if (!botsEnabled()) throw new Error("Practice tables need ENABLE_DEV_BOTS=1 (never in production).");
    const maxSeats = Math.min(Math.max(opts.maxSeats ?? 6, 2), 9);
    const botCount = Math.min(Math.max(opts.bots ?? maxSeats - 1, 0), maxSeats - 1);
    const bb = opts.bb ?? 100;
    const level: BlindLevel = { sb: Math.floor(bb / 2), bb, ante: 0 };
    const startingStack = opts.startingStack ?? bb * 100;
    const row = await this.db.table.create({
      data: { name: "Practice table", maxSeats, level, startingStack },
    });
    const runtime = this.add(new TableRuntime(this.configFor(row), this.store));
    for (const bot of await ensureBots(this.db, botCount)) {
      await runtime.seat({ playerId: bot.id, name: bot.displayName, stack: startingStack, isBot: true });
    }
    // Practice bots that bust come back with a fresh stack.
    runtime.on("bust", (p) => {
      if (p.isBot) void runtime.seat({ playerId: p.playerId, name: p.name, stack: startingStack, isBot: true });
    });
    return runtime;
  }

  /** A logged-in user takes a free seat at a practice table. */
  async takeSeat(tableId: string, who: GameIdentity): Promise<TableError | null> {
    const runtime = this.tables.get(tableId);
    if (!runtime) return { code: "not_found", message: "Table not found." };
    if (!runtime.config.practice) return { code: "not_practice", message: "Seats at tournament tables are assigned by the tournament." };
    const [row, user] = await Promise.all([
      this.db.table.findUnique({ where: { id: tableId }, select: { startingStack: true } }),
      this.db.user.findUnique({ where: { id: who.userId }, select: { avatarUrl: true } }),
    ]);
    const result = await runtime.seat({ playerId: who.userId, name: who.name, avatarUrl: user?.avatarUrl, stack: row?.startingStack ?? 10_000, isBot: false });
    return "code" in result ? result : null;
  }

  /** Closes a table for good (stops play and marks it CLOSED so it isn't restored). */
  async closeTable(tableId: string): Promise<boolean> {
    const runtime = this.tables.get(tableId);
    if (runtime) await runtime.close();
    this.tables.delete(tableId);
    const { count } = await this.db.table.updateMany({ where: { id: tableId }, data: { status: "CLOSED" } });
    return count > 0;
  }

  /** Stops all timers (shutdown, tests). Tables stay OPEN in the database and resume on the next start. */
  async stopAll(): Promise<void> {
    await Promise.all(this.all().map((t) => t.close()));
    this.tables.clear();
  }
}
