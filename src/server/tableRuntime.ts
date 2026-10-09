import { EventEmitter } from "node:events";
import { fullDeck } from "@/lib/poker/cards";
import { applyAction, IllegalAction, legalActions, startHand } from "@/lib/poker/hand";
import { initialPositions, nextPositions } from "@/lib/poker/positions";
import { cryptoRng, seededRng, shuffle, type Rng } from "@/lib/poker/rng";
import { randomAction } from "@/lib/poker/sim";
import type { ActionInput, BlindLevel, HandState, LegalActions, Positions } from "@/lib/poker/types";
import { viewFor as engineView } from "@/lib/poker/view";
import type { ClientTableView, PreAction } from "@/lib/protocol/messages";

// One poker table on the game server (design.md §6.2).
// Every input goes through a single queue, so the table changes one step at a time.

export type SeatedPlayer = {
  playerId: string;
  name: string;
  seatNo: number;
  stack: number;
  isBot: boolean;
  sittingOut: boolean;
  timeBankMs: number;
  /** Leaves after the current hand (folded automatically when it's their turn). */
  leaving: boolean;
  preAction: PreAction | null;
};

/** Saved at the start and end of every hand; enough to rebuild the table after a restart. */
export type TableSnapshot = {
  version: 1;
  /** Number of the last hand started. */
  handNo: number;
  /** True while a hand is being played (a restart then cancels it). */
  inHand: boolean;
  /** Positions of the last finished hand (the next hand's positions follow from them). */
  lastPositions: Positions | null;
  /** Stacks before the current hand (if inHand) or after the last one. */
  players: Omit<SeatedPlayer, "preAction" | "leaving">[];
};

export type HandRecord = {
  tableId: string;
  contestId: string | null;
  state: HandState;
  startedAt: Date;
  endedAt: Date;
  /** Time of each event in state.events. */
  eventTimes: Date[];
  /** Indexes of events made by the server (timeouts, sitting out). */
  autoEvents: number[];
};

export interface TableStore {
  saveSnapshot(tableId: string, snapshot: TableSnapshot): Promise<void>;
  saveHand(record: HandRecord): Promise<void>;
}

export type TableConfig = {
  tableId: string;
  contestId: string | null;
  name: string;
  maxSeats: number;
  practice: boolean;
  /** Blind level for the next hand (fixed for practice tables; the contest clock for tournaments). */
  level: () => BlindLevel;
  actionMs: number;
  timeBankMs: number;
  /** Pause after a hand ends (showdown display) before the next one. */
  betweenHandsMs?: number;
  /** Delay before an automatic action for a sitting-out player. */
  autoActMs?: number;
  /** Dev bots think for a random time in this range. */
  botDelayMs?: [number, number];
};

export type TableError = { code: string; message: string };

const NOTICE_RESTART = "The last hand was cancelled because the server restarted. Chips are back where they were before it.";

export class TableRuntime extends EventEmitter<{ change: []; bust: [SeatedPlayer]; handEnd: [HandState] }> {
  private players = new Map<number, SeatedPlayer>();
  private hand: HandState | null = null;
  private handStartedAt = new Date(0);
  private eventTimes: Date[] = [];
  private autoEvents: number[] = [];
  private lastPositions: Positions | null = null;
  private handNo = 0;
  private turn: { seatNo: number; deadline: number; timeBank: boolean; bankStartedAt: number } | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private nextHandTimer: NodeJS.Timeout | null = null;
  private nextHandAt: number | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private seenActionIds = new Set<string>();
  private paused = false;
  private closed = false;
  private notice: string | null = null;

  constructor(
    readonly config: TableConfig,
    private readonly store: TableStore,
    private readonly rng: Rng = cryptoRng,
    private readonly botRng: Rng = seededRng(Date.now() >>> 0),
  ) {
    super();
  }

  /** Rebuilds a table from its last snapshot. A hand that was in progress is cancelled. */
  static restore(config: TableConfig, store: TableStore, snapshot: TableSnapshot, rng?: Rng, botRng?: Rng): TableRuntime {
    const t = new TableRuntime(config, store, rng, botRng);
    for (const p of snapshot.players) t.players.set(p.seatNo, { ...p, leaving: false, preAction: null });
    t.handNo = snapshot.inHand ? snapshot.handNo - 1 : snapshot.handNo;
    t.lastPositions = snapshot.lastPositions;
    if (snapshot.inHand) t.notice = NOTICE_RESTART;
    t.scheduleNextHand(config.betweenHandsMs ?? 3000);
    return t;
  }

  get id() {
    return this.config.tableId;
  }

  /** Runs `fn` after everything queued before it. */
  private run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch((error) => console.error(`[table ${this.id}]`, error));
    return next;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  seatOf(playerId: string): SeatedPlayer | undefined {
    return [...this.players.values()].find((p) => p.playerId === playerId);
  }

  seatedPlayers(): SeatedPlayer[] {
    return [...this.players.values()].sort((a, b) => a.seatNo - b.seatNo);
  }

  /** Full engine state, including hidden cards. Server-internal only: never send it to a client. */
  currentHand(): HandState | null {
    return this.hand;
  }

  isHandRunning(): boolean {
    return this.hand !== null && !this.hand.ended;
  }

  /** Seats a player in a free (random) seat; they join from the next hand. */
  seat(player: { playerId: string; name: string; stack: number; isBot: boolean; seatNo?: number }): Promise<SeatedPlayer | TableError> {
    return this.run(() => {
      if (this.closed) return { code: "table_closed", message: "This table is closed." };
      const existing = this.seatOf(player.playerId);
      if (existing) return existing;
      const free = Array.from({ length: this.config.maxSeats }, (_, i) => i + 1).filter((n) => !this.players.has(n));
      if (free.length === 0) return { code: "table_full", message: "This table is full." };
      const seatNo = player.seatNo && free.includes(player.seatNo) ? player.seatNo : free[this.rng(free.length)];
      const seated: SeatedPlayer = {
        playerId: player.playerId,
        name: player.name,
        seatNo,
        stack: player.stack,
        isBot: player.isBot,
        sittingOut: false,
        timeBankMs: this.config.timeBankMs,
        leaving: false,
        preAction: null,
      };
      this.players.set(seatNo, seated);
      this.scheduleNextHand(1000);
      this.emit("change");
      return seated;
    });
  }

  /** Leaves now, or after the current hand if dealt in (folding when their turn comes). */
  leave(playerId: string): Promise<void> {
    return this.run(() => {
      const p = this.seatOf(playerId);
      if (!p) return;
      const inHand = this.hand && !this.hand.ended && this.hand.seats.some((x) => x.playerId === playerId && x.status !== "folded");
      if (inHand) {
        p.leaving = true;
        if (this.hand!.toAct === p.seatNo) this.setupTurn();
      } else {
        this.players.delete(p.seatNo);
      }
      this.emit("change");
    });
  }

  /** A player's action. Returns an error for the player, or null when accepted (or a duplicate). */
  act(playerId: string, handNo: number, actionId: string, action: ActionInput): Promise<TableError | null> {
    return this.run(() => {
      const key = `${playerId}:${actionId}`;
      if (this.seenActionIds.has(key)) return null; // double click / resend
      const p = this.seatOf(playerId);
      if (!p) return { code: "not_seated", message: "You are not seated at this table." };
      if (!this.hand || this.hand.ended || this.hand.handNo !== handNo) return { code: "stale_hand", message: "That hand is over." };
      if (this.hand.toAct !== p.seatNo) return { code: "not_your_turn", message: "It's not your turn." };
      try {
        this.apply(p.seatNo, action, false);
      } catch (error) {
        if (error instanceof IllegalAction) return { code: error.code, message: error.message };
        throw error;
      }
      this.remember(key);
      return null;
    });
  }

  setPreAction(playerId: string, value: PreAction | null): Promise<void> {
    return this.run(() => {
      const p = this.seatOf(playerId);
      if (!p) return;
      p.preAction = value;
      this.emit("change");
    });
  }

  /** "I'm back": stop auto-folding for this player. */
  sitIn(playerId: string): Promise<void> {
    return this.run(() => {
      const p = this.seatOf(playerId);
      if (!p || !p.sittingOut) return;
      p.sittingOut = false;
      this.emit("change");
    });
  }

  pause(): Promise<void> {
    return this.run(() => {
      this.paused = true;
      this.clearNextHand();
      this.emit("change");
    });
  }

  resume(): Promise<void> {
    return this.run(() => {
      this.paused = false;
      this.scheduleNextHand(1000);
      this.emit("change");
    });
  }

  close(): Promise<void> {
    return this.run(() => {
      this.closed = true;
      this.clearTurn();
      this.clearNextHand();
      this.emit("change");
    });
  }

  /** Waits for everything queued so far (tests, shutdown). */
  idle(): Promise<void> {
    return this.run(() => undefined);
  }

  /** What one viewer (a player's id, or null for a spectator) may see. */
  viewFor(viewerId: string | null): ClientTableView {
    const hand = this.hand;
    const running = hand && !hand.ended;
    const me = viewerId ? this.seatOf(viewerId) : undefined;
    return {
      tableId: this.id,
      name: this.config.name,
      maxSeats: this.config.maxSeats,
      practice: this.config.practice,
      status: this.closed ? "closed" : this.paused ? "paused" : running ? "playing" : "waiting",
      level: running ? hand.level : this.config.level(),
      players: this.seatedPlayers().map((p) => {
        const inHand = running ? hand.seats.find((x) => x.playerId === p.playerId) : undefined;
        return { seatNo: p.seatNo, playerId: p.playerId, name: p.name, stack: inHand ? inHand.stack : p.stack, isBot: p.isBot, sittingOut: p.sittingOut };
      }),
      hand: hand ? engineView(hand, viewerId) : null,
      turn: this.turn ? { seatNo: this.turn.seatNo, deadline: this.turn.deadline, timeBank: this.turn.timeBank } : null,
      you: me ? { seatNo: me.seatNo, sittingOut: me.sittingOut, preAction: me.preAction, timeBankMs: me.timeBankMs } : null,
      nextHandAt: this.nextHandAt,
      notice: this.notice,
    };
  }

  // ── Hand loop ───────────────────────────────────────────────────────────────

  private eligible(): SeatedPlayer[] {
    const players = this.seatedPlayers().filter((p) => p.stack > 0 && !p.leaving);
    // Practice tables only deal while a real person is sitting there: bots never play on their own.
    if (this.config.practice && players.every((p) => p.isBot)) return [];
    return players;
  }

  private scheduleNextHand(delayMs: number) {
    if (this.closed || this.paused || this.isHandRunning() || this.nextHandTimer) return;
    if (this.eligible().length < 2) return;
    this.nextHandAt = Date.now() + delayMs;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.nextHandAt = null;
      void this.run(() => this.startNextHand());
    }, delayMs);
  }

  private clearNextHand() {
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
    this.nextHandAt = null;
  }

  private async startNextHand() {
    if (this.closed || this.paused || this.isHandRunning()) return;
    const players = this.eligible();
    if (players.length < 2) {
      this.emit("change");
      return;
    }
    const occupied = players.map((p) => p.seatNo);
    const positions = this.lastPositions
      ? nextPositions(this.lastPositions, occupied)
      : initialPositions(occupied, occupied[this.rng(occupied.length)]);

    this.handNo++;
    await this.saveSnapshot(true);

    this.hand = startHand({
      handNo: this.handNo,
      level: this.config.level(),
      positions,
      players: players.map((p) => ({ seatNo: p.seatNo, playerId: p.playerId, stack: p.stack })),
      deck: shuffle(fullDeck(), this.rng),
    });
    this.handStartedAt = new Date();
    this.eventTimes = [];
    this.autoEvents = [];
    this.notice = null;
    for (const p of this.players.values()) p.preAction = null;
    await this.afterChange(false);
  }

  /** Applies an action for the player in `seatNo`. Throws IllegalAction for a bad player action. */
  private apply(seatNo: number, action: ActionInput, auto: boolean) {
    const before = this.hand!.events.length;
    const p = this.players.get(seatNo)!;
    // Time used from the time bank is gone.
    if (this.turn?.seatNo === seatNo && this.turn.timeBank) {
      p.timeBankMs = Math.max(0, p.timeBankMs - (Date.now() - this.turn.bankStartedAt));
    }
    this.hand = applyAction(this.hand!, seatNo, action);
    for (let i = before; i < this.hand.events.length; i++) if (auto) this.autoEvents.push(i);
    void this.afterChange(true);
  }

  private async afterChange(fromAction: boolean) {
    const hand = this.hand!;
    while (this.eventTimes.length < hand.events.length) this.eventTimes.push(new Date());
    this.clearTurn();
    if (hand.ended) {
      this.emit("change");
      // Persisting happens in the queue so the next input sees the finished hand.
      if (fromAction) void this.run(() => this.onHandEnded());
      else await this.onHandEnded();
      return;
    }
    this.setupTurn();
    this.emit("change");
  }

  private setupTurn() {
    this.clearTurn();
    const hand = this.hand;
    if (!hand || hand.ended || hand.toAct === null) return;
    const seatNo = hand.toAct;
    const p = this.players.get(seatNo)!;
    const legal = legalActions(hand, seatNo)!;

    if (p.sittingOut || p.leaving) {
      this.turnTimer = setTimeout(() => this.auto(seatNo, hand.handNo, autoAction(legal), true), this.config.autoActMs ?? 500);
      return;
    }
    if (p.isBot) {
      const [min, max] = this.config.botDelayMs ?? [700, 2000];
      const action = randomAction(legal, this.botRng);
      this.turnTimer = setTimeout(() => this.auto(seatNo, hand.handNo, action, false), min + this.botRng(max - min + 1));
      return;
    }
    if (p.preAction) {
      const action = p.preAction === "check_fold" ? autoAction(legal) : legal.call !== null ? { type: "call" as const } : { type: "check" as const };
      p.preAction = null;
      this.turnTimer = setTimeout(() => this.auto(seatNo, hand.handNo, action, false), 0);
      return;
    }
    const now = Date.now();
    this.turn = { seatNo, deadline: now + this.config.actionMs, timeBank: false, bankStartedAt: 0 };
    this.turnTimer = setTimeout(() => void this.run(() => this.onClock(seatNo, hand.handNo)), this.config.actionMs);
  }

  /**
   * Queued action decided ahead of time (bot, pre-action, sitting out); ignored if the turn has moved on.
   * `byServer` marks it as automatic in the hand history.
   */
  private auto(seatNo: number, handNo: number, action: ActionInput, byServer: boolean) {
    void this.run(() => {
      if (!this.hand || this.hand.ended || this.hand.handNo !== handNo || this.hand.toAct !== seatNo) return;
      try {
        this.apply(seatNo, action, byServer);
      } catch (error) {
        if (!(error instanceof IllegalAction)) throw error;
        this.apply(seatNo, autoAction(legalActions(this.hand, seatNo)!), true);
      }
    });
  }

  /** The action clock ran out: use the time bank, then check or fold and sit the player out. */
  private onClock(seatNo: number, handNo: number) {
    if (!this.hand || this.hand.handNo !== handNo || this.hand.toAct !== seatNo || !this.turn) return;
    const p = this.players.get(seatNo)!;
    const now = Date.now();
    if (!this.turn.timeBank && p.timeBankMs > 0) {
      this.turn = { seatNo, deadline: now + p.timeBankMs, timeBank: true, bankStartedAt: now };
      this.turnTimer = setTimeout(() => void this.run(() => this.onClock(seatNo, handNo)), p.timeBankMs);
      this.emit("change");
      return;
    }
    if (this.turn.timeBank) p.timeBankMs = 0;
    p.sittingOut = true;
    this.turn = null;
    this.apply(seatNo, autoAction(legalActions(this.hand, seatNo)!), true);
  }

  private clearTurn() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turn = null;
  }

  private async onHandEnded() {
    const hand = this.hand!;
    if (!hand.ended) return;
    try {
      await this.store.saveHand({
        tableId: this.id,
        contestId: this.config.contestId,
        state: hand,
        startedAt: this.handStartedAt,
        endedAt: this.eventTimes.at(-1) ?? new Date(),
        eventTimes: this.eventTimes,
        autoEvents: this.autoEvents,
      });
    } catch (error) {
      console.error(`[table ${this.id}] saving hand ${hand.handNo} failed`, error);
    }

    for (const x of hand.seats) {
      const p = this.players.get(x.seatNo);
      if (p && p.playerId === x.playerId) p.stack = x.stack;
    }
    this.lastPositions = hand.positions;
    for (const p of this.seatedPlayers()) {
      if (p.stack === 0) {
        this.players.delete(p.seatNo);
        this.emit("bust", p);
      } else if (p.leaving) {
        this.players.delete(p.seatNo);
      }
    }
    await this.saveSnapshot(false);
    this.emit("handEnd", hand);
    this.scheduleNextHand(this.config.betweenHandsMs ?? 3000);
    this.emit("change");
  }

  private async saveSnapshot(inHand: boolean) {
    const snapshot: TableSnapshot = {
      version: 1,
      handNo: this.handNo,
      inHand,
      lastPositions: this.lastPositions,
      players: this.seatedPlayers()
        .filter((p) => p.stack > 0)
        .map(({ playerId, name, seatNo, stack, isBot, sittingOut, timeBankMs }) => ({ playerId, name, seatNo, stack, isBot, sittingOut, timeBankMs })),
    };
    try {
      await this.store.saveSnapshot(this.id, snapshot);
    } catch (error) {
      console.error(`[table ${this.id}] saving snapshot failed`, error);
    }
  }

  private remember(key: string) {
    this.seenActionIds.add(key);
    if (this.seenActionIds.size > 500) this.seenActionIds.delete(this.seenActionIds.values().next().value!);
  }
}

/** Timeouts and sitting out: check if possible, otherwise fold. */
function autoAction(legal: LegalActions): ActionInput {
  return legal.check ? { type: "check" } : { type: "fold" };
}
