# Design: Poker Contest Website (v1)

> Companion to [`intent.md`](./intent.md) (**what** and why) and [`plan.md`](./plan.md) (**order** of work). This document says **how**.
> Status: Draft v1 · 2026-10-09

---

## 1. Summary of v1 Decisions

| Area | Decision |
|------|----------|
| Game | **No-Limit Texas Hold'em**, tournaments only, 2–9 seats per table |
| Formats | **Sit & Go** (starts when full, one table) and **scheduled MTT** (multi-table, balanced) |
| Money | **Play money only.** Tournament chips, whole numbers, no cash value |
| Antes | Optional **big-blind ante** (the big blind pays the ante for the whole table) |
| Button | **Dead-button rule**: the big blind always moves forward one player |
| Real time | One always-on **game server** (Node + WebSocket) runs every table in memory |
| Accounts | Standalone; same Auth.js approach as TradingContest, rebuilt here |
| Brand | Working name **RiverKings**, from one config file, never hardcoded |
| Stack | Next.js (App Router) + TypeScript + Tailwind · Prisma + **Neon Postgres** · Auth.js · `ws` · no Redis, no Docker |
| v1.1 | Season points, hand-for-hand play |

---

## 2. System Architecture

```
   Browser                              ┌─────────────────────────────────┐
 ┌──────────────┐  pages, auth,         │       Next.js app (Vercel)       │
 │   React UI   │  server actions       │ pages · server actions · /api/*  │
 │              │◄─────────────────────►│ issues game tokens (JWT, 5 min)  │
 │ lobby, admin │                       └──────┬──────────────────┬───────┘
 │              │                              │ read/write       │ POST /internal/*
 │ poker table  │                              ▼                  │ (shared secret)
 │  (WebSocket) │                       ┌──────────────┐          │
 └──────▲───────┘                       │ Neon Postgres│          │
        │                               │ source of    │          │
        │ wss:// game messages          │ truth        │          │
        │                               └──────▲───────┘          │
 ┌──────┴──────────────────────────────────────┴──────────────────▼──────┐
 │                  Game server (always-on Node process)                  │
 │  memory: Map<tableId, TableRuntime>, Map<contestId, TournamentDirector>│
 │  · WebSocket server: players, spectators, chat                         │
 │  · Contest ticker (every 5 s): start MTTs, advance blind levels        │
 │  · Persists hands, stacks, results and table snapshots to Postgres     │
 └────────────────────────────────────────────────────────────────────────┘
```

### Why a separate game server
Vercel functions are short-lived and can't hold WebSocket connections or run timers. Poker needs both: an action clock per table and pushed updates to every seat. The game server is the same idea as TradingContest's worker.

### Why everything in one process (v1)
A table's state changes many times per second and must be processed **one action at a time**. Keeping each table in the memory of a single process gives that ordering for free, with no locks and no Redis. v1 scale (~200 players per MTT, a few contests at once) fits easily in one small machine. Scaling out later means sharding contests across processes; nothing in this design blocks that.

### Components

| Component | Runs on | Responsibility |
|-----------|---------|----------------|
| Next.js app | Vercel | Pages, auth, lobby, registration, admin, results, hand replayer, profiles |
| Game server | Railway / Fly.io | Tables, tournament directors, blind clock, WebSocket, chat |
| Postgres | Neon | Users, contests, entries, hands, chat, results |
| Poker engine | library inside the game server (`src/lib/poker`) | Pure rules: dealing, betting, pots, showdown |

---

## 3. Branding (configurable)

All brand values live in **one file**; nothing else in `src/` may contain the brand name.

```ts
// src/config/brand.ts
export const brand = {
  name:        env("NEXT_PUBLIC_BRAND_NAME",    "RiverKings"),
  shortName:   env("NEXT_PUBLIC_BRAND_SHORT",   "RiverKings"),
  tagline:     env("NEXT_PUBLIC_BRAND_TAGLINE", "Play-money poker tournaments"),
  domain:      env("NEXT_PUBLIC_BRAND_DOMAIN",  "localhost:3000"),
  supportEmail:env("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com"),
  emailFrom:   env("EMAIL_FROM_NAME",           "RiverKings"),
  logo:        { light: "/brand/logo-light.svg", dark: "/brand/logo-dark.svg", mark: "/brand/mark.svg" },
  favicon:     "/brand/favicon.png",
} as const;
```

- **Used by:** header/footer, `generateMetadata` (titles, Open Graph), `manifest.ts`, email templates, rules/privacy/contact pages, the game server's log prefix.
- **Colours:** CSS variables in `globals.css` (`--color-bg`, `--color-surface`, `--color-accent`, `--color-felt`, `--color-card-red`, …) for light and dark; Tailwind maps to these tokens. Components never use brand-specific class names.
- **Assets:** only in `public/brand/`.
- **Generic code names:** package `poker-contest`, database `poker`, no brand in identifiers.
- **Brand guard test** (`tests/brand.test.ts`): scans `src/` and fails if the current `brand.name` appears outside `src/config/brand.ts`.
- **Rebrand =** change env vars or `brand.ts` defaults + replace files in `public/brand/`.

---

## 4. Data Model (Prisma)

All chip amounts are **integers** (`Int`). Times are UTC.

```prisma
enum Role            { USER ADMIN }
enum ContestFormat   { SNG MTT }
enum ContestStatus   { DRAFT REGISTERING RUNNING PAUSED FINISHED CANCELLED }
enum EntryStatus     { REGISTERED ACTIVE BUSTED REMOVED }
enum TableStatus     { OPEN CLOSED }
enum Street          { PREFLOP FLOP TURN RIVER SHOWDOWN }
enum ActionType      { POST_SB POST_BB POST_ANTE FOLD CHECK CALL BET RAISE ALL_IN TIMEOUT }
enum ChatChannel     { PLAYERS SPECTATORS }

model User {
  id              String    @id @default(cuid())
  email           String    @unique
  emailVerified   DateTime?
  passwordHash    String?             // null for Google-only users
  displayName     String    @unique
  avatarUrl       String?
  role            Role      @default(USER)
  isBot           Boolean   @default(false)   // dev/test bots only; refused in production
  chatBannedUntil DateTime?
  createdAt       DateTime  @default(now())
  entries         Entry[]
}

model VerificationToken {               // same as TradingContest
  id        String   @id @default(cuid())
  email     String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([email])
}

model BlindTemplate {                    // "Turbo", "Regular" — editable by admins
  id        String   @id @default(cuid())
  name      String   @unique
  levels    Json     // BlindLevel[] = [{ sb, bb, ante, minutes }]
  createdAt DateTime @default(now())
}

model Contest {
  id              String        @id @default(cuid())
  slug            String        @unique
  title           String
  description     String
  format          ContestFormat
  status          ContestStatus @default(DRAFT)
  seatsPerTable   Int           // 2–9
  startingStack   Int
  levels          Json          // copied from the template on publish, then frozen
  actionSeconds   Int           @default(20)
  timeBankSeconds Int           @default(30)
  minPlayers      Int           @default(2)
  maxPlayers      Int           // SNG: = seatsPerTable
  startAt         DateTime?     // MTT only; SNG starts when full
  lateRegLevels   Int           @default(0)   // MTT: registration stays open for N levels
  currentLevel    Int           @default(0)
  levelStartedAt  DateTime?
  pausedAt        DateTime?
  startedAt       DateTime?
  finishedAt      DateTime?
  createdById     String
  createdAt       DateTime      @default(now())
  entries         Entry[]
  tables          Table[]
  @@index([status])
}

model Entry {                            // one per user per contest: registration + result
  id          String      @id @default(cuid())
  contestId   String
  userId      String
  status      EntryStatus @default(REGISTERED)
  stack       Int?                       // updated after every hand
  tableId     String?
  seatNo      Int?
  place       Int?                       // set when busted / at finish
  bustedHandId String?
  timeBankMs  Int?
  registeredIp String?
  createdAt   DateTime    @default(now())
  @@unique([contestId, userId])
  @@index([contestId, status])
}

model Table {
  id         String      @id @default(cuid())
  contestId  String
  number     Int                         // "Table 3"
  status     TableStatus @default(OPEN)
  buttonSeat Int?
  handNo     Int         @default(0)
  snapshot   Json?                       // TableSnapshot taken at the start of every hand (§7.4)
  updatedAt  DateTime    @updatedAt
  @@unique([contestId, number])
}

model Hand {
  id         String   @id @default(cuid())
  contestId  String
  tableId    String
  handNo     Int
  level      Int
  sb         Int
  bb         Int
  ante       Int
  buttonSeat Int
  board      String[]                    // ["Ah","Kd","7c","2s","9h"]
  deck       String[]                    // full shuffled deck, admin-only (audit)
  totalPot   Int
  startedAt  DateTime
  endedAt    DateTime
  players    HandPlayer[]
  actions    HandAction[]
  @@unique([tableId, handNo])
  @@index([contestId])
}

model HandPlayer {
  handId        String
  userId        String
  seatNo        Int
  startStack    Int
  endStack      Int
  holeCards     String[]                 // stored; only revealed per §6.6
  shown         Boolean  @default(false) // shown at showdown → visible in replays
  vpip          Boolean                  // voluntarily put chips in pre-flop
  pfr           Boolean                  // raised pre-flop
  sawShowdown   Boolean
  won           Int                      // chips won from pots
  @@id([handId, userId])
  @@index([userId])
}

model HandAction {
  handId   String
  seq      Int
  street   Street
  userId   String?
  type     ActionType
  amount   Int        // chips added by this action
  toAmount Int        // player's total bet on this street after the action
  at       DateTime
  @@id([handId, seq])
}

model ChatMessage {
  id          String      @id @default(cuid())
  contestId   String
  tableId     String
  userId      String
  channel     ChatChannel
  text        String
  createdAt   DateTime    @default(now())
  deletedAt   DateTime?
  deletedById String?
  reports     ChatReport[]
  @@index([tableId, createdAt])
}

model ChatReport {
  id           String    @id @default(cuid())
  messageId    String
  reporterId   String
  reason       String?
  createdAt    DateTime  @default(now())
  resolvedAt   DateTime?
  resolvedById String?
  @@unique([messageId, reporterId])
}

model AuditLog {                         // every admin action
  id        String   @id @default(cuid())
  actorId   String
  action    String   // "contest.pause", "entry.remove", "chat.delete", "user.chatBan", …
  targetId  String
  details   Json?
  createdAt DateTime @default(now())
}
```

### Derived values (computed, never stored)
- Players left, average stack, chip leader: from `Entry` rows with status `ACTIVE`.
- Stats (§11): aggregated from `HandPlayer`.
- Contest results: `Entry.place` ordered ascending.

---

## 5. Poker Engine (`src/lib/poker`)

A pure library: no I/O, no timers, no `Date.now()`, no `Math.random()`. Time and randomness are passed in. This makes every hand reproducible from a seed.

### 5.1 Cards
- Card = 2-char string: rank `23456789TJQKA` + suit `cdhs` (`"Ah"`, `"Tc"`).
- `shuffle(rng)`: Fisher–Yates. Production rng = `crypto.randomInt`; tests use a seeded PRNG or a fixed deck.

### 5.2 Hand evaluator
- `evaluate7(cards: Card[7]) → { rank: number, category, best5: Card[], name }`. Higher `rank` wins; equal `rank` = split.
- Implementation: rank all 21 five-card combinations with a straightforward 5-card scorer (category × 13⁵ + kickers). Fast enough (≪ 1 ms per hand) and easy to verify; a lookup-table evaluator can replace it later behind the same interface.
- Readable names: "Straight, Five high", "Full house, Kings over Sevens", "Two pair, Aces and Nines".

### 5.3 State
```ts
type Seat = {
  seatNo: number; playerId: string;
  stack: number;            // chips behind
  bet: number;              // chips put in on the current street
  committed: number;        // chips put in this hand (all streets)
  hole: Card[] | null;
  status: "active" | "folded" | "allin" | "sittingOut";
  hasActed: boolean;        // acted since the last full raise
};

type HandState = {
  handNo: number; level: BlindLevel; buttonSeat: number;
  seats: Seat[];            // only players dealt in, in seat order
  deck: Card[]; board: Card[];
  street: Street;
  toAct: number | null;     // seatNo
  currentBet: number;       // highest bet on this street
  lastFullRaise: number;    // size of the last full bet/raise (starts at bb)
  pots: Pot[];              // computed at the end of each street
  events: GameEvent[];      // append-only log → HandAction rows + animations
  result?: HandResult;
};
```

### 5.4 API
```ts
startHand(input: { seats, buttonSeat, level, handNo, deck }): HandState
legalActions(state, seatNo): { fold, check, call?: number, minRaiseTo?: number, maxRaiseTo?: number }
applyAction(state, seatNo, action: {type, toAmount?}): HandState   // throws IllegalAction
viewFor(state, viewer: playerId | "spectator"): TableView         // §6.6
nextButton(prev, seats): { buttonSeat, sbSeat, bbSeat }            // dead-button rule
```

### 5.5 Betting rules
- **Blinds:** SB and BB posted at the start; with a BB ante, the BB also posts the ante into the pot (not a live bet). A player short of the blind/ante posts what they have and is all-in.
- **Heads-up:** the button is the small blind and acts first pre-flop, last on later streets.
- **Order:** pre-flop starts left of the BB; later streets start left of the button. Folded and all-in players are skipped.
- **Minimum bet:** one big blind. **Minimum raise:** raise *to* `currentBet + lastFullRaise`.
- **Short all-in:** an all-in that is less than a full raise does **not** reopen betting. Players who already acted on this street may only call or fold. (Tracked with `hasActed` + `lastFullRaise`.)
- **Street ends** when every non-folded, non-all-in player has acted and matched `currentBet` (or only one player is left).
- **Everyone all-in** (or all but one): deal the remaining board without betting.
- **Uncalled bet:** the part of the last bet nobody called is returned to the bettor before pots are built.

### 5.6 Pots
At the end of each street, build pots from `committed`:
1. Sort the distinct `committed` levels of all-in players.
2. For each level, every player contributes `min(committed, level) − previous level`; eligible players are non-folded players with `committed ≥ level`.
3. The remainder forms the last pot for the players still in.
- Folded players' chips stay in the pots, but they are never eligible.
- **Awarding:** for each pot (side pots first), the best eligible hand wins; ties split evenly. The **odd chip** goes to the first winner left of the button.

### 5.7 Showdown order
- The last aggressor on the river shows first; if there was no river bet, the first player left of the button shows first.
- v1 auto-shows every hand still in at showdown (no mucking). Simple, and fair in a play-money game. Winners by fold don't show.

### 5.8 Button and blinds between hands (dead-button rule)
- The **big blind always moves to the next player** still in the tournament.
- The small blind is the seat the previous BB was in (it may be empty → no SB that hand).
- The button is the seat the previous SB was in (it may be empty → "dead button").
- Players moved in from another table may be dealt in immediately in any position (intent: simple; no "wait for the big blind").

### 5.9 Invariants (checked in tests and the simulator)
- Chips are conserved: Σ stacks + Σ pots = Σ starting stacks, after every action.
- Only `legalActions` are ever accepted.
- No card appears twice; deck + board + hole cards = 52.
- `viewFor(viewer)` never contains another player's hole cards unless they were shown at showdown.

---

## 6. Game Server (`src/server`)

### 6.1 Processes inside the server
```
GameServer
 ├─ WebSocket hub          connections, auth, subscriptions (table rooms)
 ├─ TournamentDirector[]   one per RUNNING contest: seating, balancing, bust-outs, blind clock
 │    └─ TableRuntime[]    one per OPEN table: engine state, action queue, timers
 ├─ ContestTicker          every 5 s: start due MTTs, advance levels, recover after restart
 └─ Internal HTTP API      /health, /internal/* (called by the Next.js app)
```

### 6.2 TableRuntime
- **One queue per table:** every input (player action, timeout, sit-in, director command) is processed one at a time. No locks needed.
- **Loop:** `startHand → (await action | timeout)* → hand end → persist → ask the director → short pause (3 s for the showdown) → next hand`.
- **Action clock:** `actionSeconds` per decision. When it runs out, the player's time bank runs; when that is empty → auto **check** if possible, otherwise **fold**, and the player is marked **sitting out**.
- **Sitting out:** the player is still dealt in and pays blinds, but acts instantly (check/fold). They return with a "I'm back" button (`sit_in`).
- **Time bank:** starts at `timeBankSeconds`, +10 s at every new blind level, max 60 s.
- **Disconnect** = no special case: the clock runs; the player becomes sitting out after a timeout.

### 6.3 Authentication
1. The browser calls `GET /api/game-token` (Next.js, requires a session).
2. The app returns a JWT signed with `GAME_TOKEN_SECRET` (HS256, 5-minute expiry, claims: `sub` userId, `name`, `role`).
3. The browser opens `wss://<game-server>/ws` and sends `{ t: "hello", token }` as the first message (not in the URL, so it never appears in logs).
4. No token or invalid → the connection may only spectate.
- Internal API calls from Next.js use `Authorization: Bearer INTERNAL_API_SECRET`.

### 6.4 WebSocket protocol
JSON messages with a type field `t`. Every incoming message is validated with zod; invalid → `error`.

**Client → server**
| `t` | Payload | Notes |
|-----|---------|-------|
| `hello` | `token?` | first message |
| `watch_table` | `tableId` | subscribe; seated players get their private view |
| `unwatch_table` | `tableId` | |
| `act` | `tableId, handNo, actionId, type, toAmount?` | `actionId` = client UUID for idempotency; `handNo` stops stale clicks |
| `pre_action` | `tableId, value: "check_fold" \| "call_any" \| null` | applied when your turn comes |
| `sit_in` | `tableId` | return from sitting out |
| `chat_send` | `tableId, text` | channel chosen by the server (§9) |
| `ping` | – | heartbeat every 20 s |

**Server → client**
| `t` | Payload | Notes |
|-----|---------|-------|
| `welcome` | `userId?, serverTime` | after `hello` |
| `table_view` | `TableView` | full view for this viewer, sent after every change |
| `event` | `GameEvent` | for animations/sounds (deal, bet, pot win) |
| `your_turn` | `legalActions, deadline, timeBankMs` | |
| `moved` | `fromTableId, toTableId` | MTT balancing; the client follows automatically |
| `contest` | `level, nextLevelAt, playersLeft, avgStack, status` | |
| `busted` | `place` | |
| `chat` | `ChatMessageView` | |
| `chat_deleted` | `messageId` | |
| `error` | `code, message` | |
| `pong` | – | |

**Full views, not diffs:** a `TableView` is ~1–2 KB, so the server sends the whole view on every change. This removes a class of sync bugs; reconnecting is the same as connecting.

### 6.5 Rate limits
- `act`: max 5 per second per connection; duplicates (`actionId` seen) ignored; wrong `handNo` or not your turn → `error`.
- `chat_send`: §9.
- Max 3 open connections per user.

### 6.6 Who sees which cards
`viewFor(state, viewer)` is the **only** function that turns table state into something sent over the network.
| Viewer | Own hole cards | Others' hole cards | Deck |
|--------|---------------|--------------------|------|
| Seated player | yes | only cards shown at showdown | never |
| Spectator | – | only cards shown at showdown | never |
| Admin (hand review page, after the hand) | all | all | yes |

An integration test runs full hands and asserts that **every** outgoing message to each socket contains no hole card belonging to someone else (before showdown).

### 6.7 Persistence and restart recovery
- **At hand start:** save `Table.snapshot` = seats, stacks, button, handNo, level (the state *before* the hand).
- **At hand end** (one transaction): insert `Hand`, `HandPlayer`, `HandAction`; update `Entry.stack`; set busted places.
- **On restart:** for each `RUNNING` contest, rebuild directors and tables from `Table.snapshot`. A hand that was in progress is **voided**: stacks go back to the snapshot and the hand is replayed with a new deck. Players see "Hand cancelled (server restart)".
- Blind clock survives restarts because `levelStartedAt` is in the database (paused time is excluded).
- Deploys happen between contests when possible.

---

## 7. Tournament Lifecycle

### 7.1 Statuses
```
DRAFT ──publish──► REGISTERING ──start──► RUNNING ──1 player left──► FINISHED
  │                    │                    │ ▲
  └─delete             └─cancel─► CANCELLED  pause│ │resume
                                            ▼ │
                                          PAUSED
```
- **SNG start:** when `Entry` count = `maxPlayers` (checked by the registration action via `POST /internal/contests/:id/check`, plus the ticker as a fallback).
- **MTT start:** at `startAt`. If fewer than `minPlayers` are registered → `CANCELLED` (players are notified).
- **Cancel:** allowed in DRAFT / REGISTERING; for RUNNING only by an admin (all tables stop, no results).

### 7.2 Registration
- Requires a verified email and a non-bot user (bots allowed only when `ENABLE_DEV_BOTS=1` outside production).
- Transaction with `SELECT … FOR UPDATE` on the contest row: checks status, capacity and duplicate.
- Unregister: allowed until the start.
- **MTT late registration:** while `currentLevel < lateRegLevels`, a new player gets `startingStack` and is seated at the table with the fewest players.

### 7.3 Starting
- Create `ceil(N / seatsPerTable)` tables; shuffle players and deal them round-robin so table sizes differ by at most one.
- Random button per table; time banks set; `levelStartedAt = now`.

### 7.4 Blind clock
- One clock per contest. Level `i` lasts `levels[i].minutes`. A new level applies from the **next hand** on every table.
- After the last level, the last level repeats.
- Pause: tables finish the current hand, then wait; `pausedAt` is stored and the clock shifts on resume.

### 7.5 Bust-outs and places
- A player with 0 chips after a hand is busted. Place = number of players left before that hand's bust-outs.
- **Several busted in the same hand (same table):** the one with the bigger stack at the start of the hand places higher; equal stacks share the better place.
- **Different tables at the same time:** order by hand end time (the director processes them one by one). Acceptable for v1; hand-for-hand (v1.1) removes this case near the end.
- When one player is left: place 1, contest → `FINISHED`, `finishedAt` set, tables closed.

### 7.6 MTT table balancing (TournamentDirector)
Runs **after every hand** on the table that just finished (only that table is between hands, so only its players can be moved).

```
N = active players, S = seatsPerTable, T = open tables
needed = ceil(N / S)

1. Break:   if T > needed and this table has the fewest players (ties: highest table number),
            close it and move every player to the tables with the most free seats.
            (If another table should break, it is flagged and breaks when its own hand ends.)
2. Balance: else if this table has ≥ 2 more players than the smallest table,
            move (thisTable − smallest − 1) players, choosing the player due the big blind next
            (then the next one), to the smallest table's free seats.
3. Final table: when needed = 1, the remaining tables break into the last one as above.
```
- Moved players are seated in a random free seat and dealt into the next hand on the new table.
- The client gets `moved` and switches table without a page reload.
- Pure functions `planBreak()` / `planBalance()` are unit-tested with many field sizes; a bot simulation runs 200 players down to one.

---

## 8. Spectating

- Anyone (including visitors) can watch a table of a public running contest; busted players are moved to spectator mode on their last table.
- Spectators get `viewFor(state, "spectator")` (no hole cards) **delayed by 30 s** (`SPECTATOR_DELAY_MS`), from a per-table buffer of views.
- Spectators can't see the action buttons or the private timer details.

---

## 9. Chat

- **Channels:** seated players write in `PLAYERS` (seen by players and spectators); spectators and busted players write in `SPECTATORS` (seen only by spectators). Spectator messages never reach seated players, so watchers can't pass on information.
- **Limits:** max 200 characters, 1 message per 2 s and 10 per minute per user; banned words are masked (`src/lib/chat/filter.ts`, word list in config); links are not clickable.
- **Mute:** client-side per user (stored in `localStorage`).
- **Report:** creates `ChatReport`; shows in `/admin/reports`.
- **Moderation:** admin deletes a message (`deletedAt`, broadcast `chat_deleted`) or chat-bans a user (`chatBannedUntil`). Everything goes to `AuditLog`.
- History: the last 50 messages of a table are sent on `watch_table`.

---

## 10. Next.js App

### 10.1 Routes (App Router)
| Route | Access | Purpose |
|-------|--------|---------|
| `/` | public | Featured / running contests, how it works |
| `/login`, `/signup`, `/verify` | public | Auth |
| `/contests` | public | Lobby: Registering · Running · Finished · My contests; format filter |
| `/contests/[slug]` | public | Structure, blind levels, players, register/unregister, live standings, tables |
| `/contests/[slug]/results` | public | Final standings |
| `/table/[tableId]` | public (players get their seat, others spectate) | Poker table |
| `/hands/[handId]` | players of that hand; admin | Hand replayer |
| `/contests/[slug]/hands` | logged in | My hands in this contest |
| `/u/[displayName]` | public | Profile & stats |
| `/settings` | logged in | Display name, avatar, sound/animation preferences |
| `/rules`, `/privacy`, `/contact` | public | Content (uses brand config) |
| `/admin` | admin | Contests list |
| `/admin/contests/new`, `/admin/contests/[id]` | admin | Create / edit / publish / cancel / pause / remove player |
| `/admin/blinds` | admin | Blind templates |
| `/admin/monitor` | admin | Running contests and tables |
| `/admin/reports` | admin | Chat reports, fair-play flags |

### 10.2 API routes
| Route | Purpose |
|-------|---------|
| `/api/auth/[...nextauth]` | Auth.js |
| `GET /api/game-token` | Short-lived JWT for the game server |
| `GET /api/contests/[id]/standings` | Live standings (cached 5 s) |

Mutations (register, admin actions) are **server actions** with zod validation and `requireUser()` / `requireAdmin()`. Actions that affect a running game (start check, pause, remove player) also call the game server's internal API.

### 10.3 Poker table layout
```
┌──────────────────────────────────────────────────────────────┐
│ ← Contest name · Table 3        Level 5  100/200 (200)  08:42│
├──────────────────────────────────────────────────────────────┤
│              [seat]        [seat]        [seat]              │
│     [seat]   ╭──────────────────────────────╮    [seat]      │
│              │   Pot 4,350   ·  Side pot 900 │               │
│     [seat]   │      A♠  K♦  7♣  ·   ·         │    [seat]      │
│              ╰──────────────────────────────╯               │
│              [seat]        [ YOU  A♥ A♦ ]  [seat]  (D)       │
├──────────────────────────────────────────────────────────────┤
│ chat / hand log tabs     │  [Fold] [Call 400] [Raise to 1,000]│
│                          │  ½ pot  ¾ pot  pot   ───●──── slider│
└──────────────────────────────────────────────────────────────┘
```
- Mobile (portrait): seats around a vertical oval, own seat at the bottom, action bar fixed at the bottom, chat/log in a drawer.
- Cards are drawn with SVG/CSS (no image files), with accessible labels ("Ace of hearts"); suits use colour **and** shape.
- Keyboard: F = fold, C = check/call, R = raise focus, Enter = confirm.

### 10.4 Client state
- `useGameSocket()`: one WebSocket per tab, auto-reconnect with backoff, token refresh, heartbeat.
- `useTable(tableId)`: holds the latest `TableView`, plays `event`s as animations, exposes `act()`.
- The client never computes game rules except to show buttons; the server re-checks everything.

---

## 11. Stats

Computed from `HandPlayer` (indexed by `userId`):
| Stat | Formula |
|------|---------|
| Hands played | count of `HandPlayer` rows |
| VPIP | % of hands with `vpip` (called or raised pre-flop, blinds/antes don't count) |
| PFR | % of hands with `pfr` |
| Showdown win % | hands won at showdown ÷ `sawShowdown` |
| Contests / wins / top 3 / best finish | from `Entry.place` |

Profile pages are cached (revalidated when a contest finishes).

---

## 12. Authentication & Authorization

Same approach as TradingContest, rebuilt in this repo:
- Auth.js v5, Credentials provider (email + password, bcrypt), JWT sessions with `userId` + `role`. Optional Google provider when env vars exist.
- Sign-up: email, password (min 8), display name (3–20 chars, letters/digits/underscore, unique).
- Email verification: random token, stored hashed, 24 h expiry; resend with a 1-minute cooldown. Required before registering for contests.
- `proxy.ts` protects `/admin/*`, `/settings`; `requireAdmin()` in every admin action.
- `npm run make-admin -- <email>`.

---

## 13. Security & Fairness

| Threat | Defence |
|--------|---------|
| Seeing others' cards | Only `viewFor()` leaves the engine; integration test on every message; deck never sent |
| Predicting cards | `crypto.randomInt` shuffle; deck stored for admin audit only |
| Acting out of turn / illegal bets | Engine validates every action; client input is only an intent |
| Double clicks / replays | `actionId` idempotency + `handNo` check |
| Forged identity on the socket | Signed 5-minute JWT; internal API behind a shared secret |
| Multi-accounting | Verified email; registration IP stored; same-IP entries in one contest flagged in `/admin/reports` |
| Spectator ghosting | 30 s delay; spectator chat hidden from players |
| Chat abuse | Limits, filter, reports, bans, audit log |
| Brute-force login | Rate limits on login/sign-up (as in TradingContest) |
| Dev bots in production | `ENABLE_DEV_BOTS` ignored when `NODE_ENV=production`; bots can't register then |

---

## 14. Project Structure

```
poker/
├─ prisma/                  schema.prisma, migrations, seed.ts (blind templates, sample contests)
├─ public/brand/            logos, favicon (only place for brand assets)
├─ scripts/                 make-admin.ts, sim.ts (engine simulator), load-test.ts
├─ src/
│  ├─ app/                  Next.js routes (§10.1)
│  ├─ components/           ui/, layout/, contests/, table/ (Seat, Card, Board, ActionBar, Chat…), admin/
│  ├─ config/brand.ts       §3
│  ├─ lib/
│  │  ├─ poker/             engine: cards, evaluator, hand state machine, pots, view, rng
│  │  ├─ tournament/        lifecycle, seating, balancing (pure)
│  │  ├─ chat/              filter, limits
│  │  ├─ protocol/          zod schemas shared by client and server
│  │  ├─ auth/ db.ts email/ rateLimit.ts session.ts validation/
│  │  └─ client/            useGameSocket, useTable
│  ├─ server/               game server: index.ts, hub.ts, tableRuntime.ts, director.ts, ticker.ts, persist.ts, bots.ts, internalApi.ts
│  ├─ auth.ts
│  └─ proxy.ts
└─ tests/                   e2e (Playwright), integration (real DB + game server)
```

---

## 15. Configuration (`.env.example`)

```bash
# Neon Postgres
DATABASE_URL=            # pooled
DIRECT_URL=              # direct, for migrations

# Auth.js
AUTH_SECRET=
AUTH_GOOGLE_ID=          # optional
AUTH_GOOGLE_SECRET=      # optional

# Email
EMAIL_PROVIDER=console   # console | smtp | resend
SMTP_URL=
RESEND_API_KEY=
EMAIL_FROM=              # e.g. no-reply@yourdomain

# Brand (optional overrides of src/config/brand.ts)
NEXT_PUBLIC_BRAND_NAME=
NEXT_PUBLIC_BRAND_TAGLINE=
NEXT_PUBLIC_BRAND_DOMAIN=
NEXT_PUBLIC_SUPPORT_EMAIL=
EMAIL_FROM_NAME=

# Game server
NEXT_PUBLIC_GAME_WS_URL=ws://localhost:4000/ws
GAME_SERVER_URL=http://localhost:4000      # internal API, from Next.js
GAME_TOKEN_SECRET=
INTERNAL_API_SECRET=
GAME_PORT=4000
ALLOWED_ORIGIN=http://localhost:3000
SPECTATOR_DELAY_MS=30000
ENABLE_DEV_BOTS=1                          # ignored in production
```

---

## 16. Local Development

- `npm run dev:all` runs Next.js (port 3000) and the game server (port 4000, `tsx watch`).
- `npm run db:seed` creates blind templates, an admin-owned practice SNG and dev bot users.
- **Practice table** (dev only): `/admin/monitor` → "Start practice SNG with bots" fills every seat but yours with bots.
- `npm run sim -- --hands 100000 --seed 42` runs the engine simulator.

---

## 17. Testing Strategy

| Layer | Tool | What |
|-------|------|------|
| Engine | Vitest | Evaluator (all categories, kickers, wheel, splits), betting rules (min-raise, short all-in, heads-up), pots (side, split, odd chip, uncalled bet), dead button, `viewFor` |
| Engine (property) | Vitest + fast-check | Chip conservation, legal-only actions, no duplicate cards — random games |
| Simulator | `npm run sim` | 100k random hands, all invariants |
| Tournament | Vitest | Lifecycle, registration, places (simultaneous bust-outs), `planBreak` / `planBalance` |
| Game server | Vitest integration (real DB) | Protocol validation, card-leak check on every message, timeouts/sit-out, restart recovery, idempotency |
| Web | Playwright + axe | Sign-up → verify → register → play a hand vs bots → results; admin flows; accessibility |
| Brand | Vitest | Brand name appears only in `src/config/brand.ts` |
| Load | `scripts/load-test.ts` | 200 bot clients in one MTT + 100 spectators; p95 message latency < 150 ms |

---

## 18. Deployment

| Piece | Where | Notes |
|-------|-------|-------|
| Next.js app | Vercel | `vercel-build`: `prisma migrate deploy && next build` |
| Game server | Railway or Fly.io (1 small instance, always on) | WebSocket on `wss://game.<domain>`; health check `/health` |
| Database | Neon | Pooled URL for the app, direct URL for migrations |
| Email | Resend with the brand domain | |
| Domain | `<brand domain>` + `game.<brand domain>` | From brand config / env |

Deploying the game server restarts running tables (§6.7), so deploys are scheduled when no contest is running; the admin monitor shows whether it is safe.

---

## 19. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Engine rule bugs | Pure engine, fixed-deck tests, property tests, simulator |
| Hidden-card leak | Single `viewFor()` exit, per-message leak test |
| Restart mid-hand | Hand voided and replayed from snapshot; deploy between contests |
| Single game-server process | Fine for v1 scale; contests can be sharded across processes later |
| Clock drift between tables | One blind clock per contest in the director; levels apply at the next hand |
| Mobile networks | Full-view messages make reconnect trivial; generous action timer + time bank |
| Brand leaking into code | Brand guard test in CI |

---

## 20. Next Step

Review this design, then start **M0** (Neon project + GitHub repo, from you) and **M1** (setup, brand config, auth).
