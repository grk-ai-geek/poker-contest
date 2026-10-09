# Plan: Poker Contest Website (v1)

> Builds on [`intent.md`](./intent.md) (what). [`design.md`](./design.md) (how: data model, engine state machine, WebSocket protocol) is written next, before M1 code starts.
> Status: Draft v1 · 2026-10-09

---

## How we work

- **One milestone at a time.** Each milestone ends with something you can run and click, plus a short review by you (the product owner) before the next one starts.
- **Every task is small:** roughly one sitting, and it ends with working code.
- **Engine first, UI second.** The poker rules live in a pure TypeScript library (`src/lib/poker/`) with no database or network code, so they can be tested exhaustively.
- **Dev bots from day one.** Simple scripted bots (dev/test only, never in production) fill empty seats so a full table can be tested by one person.
- **Brand never hardcoded** (intent §2a): every visible name, logo and colour comes from `src/config/brand.ts` and theme tokens.
- **Definition of done** (applies to every task):
  - It works locally (`npm run dev:all`).
  - Lint and typecheck pass.
  - Tests exist for the logic that matters (cards, chips, pots, turn order, who sees which cards).
  - The relevant `plan.md` checkbox is ticked.
- **Git:** one branch per milestone (`m1-setup`, `m2-engine`, …), merged to `main` after your review.

Legend: `[ ]` todo · `[x]` done · **(you)** = needs an action from you.

---

## Milestone overview

| # | Milestone | Outcome you can see | Depends on |
|---|-----------|---------------------|-----------|
| M0 | Prerequisites | Tools and accounts ready | – |
| M1 | Setup, brand config, DB, auth | Sign up, log in, see an empty branded site shell | M0 |
| M2 | Poker engine (pure library) | Full hands play out correctly in tests and a CLI simulator | M1 |
| M3 | Game server (WebSocket) | A table runs on the server; clients connect, act, reconnect | M2 |
| M4 | Poker table UI | Play a hand in the browser against dev bots | M3 |
| M5 | Contests + Sit & Go | Admin creates an SNG; players register, it starts when full and runs to a winner | M4 |
| M6 | Multi-table tournaments | Scheduled MTT with table balancing down to a final table | M5 |
| M7 | Results, hand history, profiles | Final standings, hand replayer, player stats | M5 |
| M8 | Chat, spectating, moderation | Table chat, delayed spectator view, admin tools | M4 |
| M9 | Polish, load test, deploy | Site live on the internet | M6, M7, M8 |
| v1.1 | Season points | Monthly season leaderboard | M9 |

M6, M7 and M8 can be built in any order after M5 (M8 only needs M4).

---

## M0: Prerequisites

- [x] Node.js 24 LTS and Git installed (already on this machine from TradingContest)
- [x] Neon account → new project `poker` **(you)**
- [x] GitHub repo `poker-contest` created **(you)**
- [x] `git init`, `.gitignore`, `.gitattributes`, first commit (`97c0b97`), pushed to `grk-ai-geek/poker-contest`
- [ ] Later (M9): Vercel and Railway/Fly.io accounts, domain for RiverKings **(you)**

**Done when:** Neon connection strings are ready for `.env.local` (never committed) and the repo has its first commit.

---

## M1: Setup, brand config, database, auth

**Setup**
- [x] Scaffold Next.js (App Router) + TypeScript + Tailwind + ESLint
- [x] Folders: `src/config`, `src/lib/poker` (engine), `src/server` (game server), `prisma/`, `tests/`
- [x] `.env.example` and `.env.local` (AUTH_SECRET generated)
- [x] Prisma: `User`, `VerificationToken` now; game models added in M3/M5
- [x] First migration on Neon
- [x] Vitest + Playwright; npm scripts `dev`, `server`, `dev:all`, `test`, `test:e2e`, `lint`, `typecheck`, `db:migrate`, `make-admin`
- [x] GitHub Actions CI: lint, typecheck, unit tests

**Brand (configurable)**
- [x] `src/config/brand.ts`: name, short name, tagline, domain, support email, email sender name, logo/favicon paths; env overrides (`NEXT_PUBLIC_BRAND_NAME`, …)
- [x] Theme tokens as CSS variables (light + dark), Tailwind reads the tokens
- [x] Page metadata, `<title>`, Open Graph, manifest and email templates all read from the brand config
- [x] Brand assets in one folder (`public/brand/`); placeholder RiverKings logo
- [x] **Brand guard test:** fails if the brand name appears anywhere in `src/` outside `src/config/brand.ts`

**Auth** (same approach as TradingContest, rebuilt here)
- [x] Auth.js v5, Credentials provider (email + password, bcrypt), JWT sessions with `userId` and `role`
- [x] Sign-up (email, password, display name) and login pages
- [x] Email verification: hashed 24 h tokens, resend with 1-minute cooldown
- [x] Email sending via console (dev) / SMTP / Resend
- [x] Rate limits on sign-up and login; safe redirect after login
- [x] `requireUser()` / `requireAdmin()` helpers + `proxy.ts` protecting `/admin/*` and table pages
- [x] `npm run make-admin -- <email>`
- [x] Optional Google login, enabled only when env vars are present

**UI shell**
- [x] Layout: header (logo, nav, account menu, theme toggle) and footer ("play money only" disclaimer)
- [x] UI primitives: Button, Badge, Card, Table, Field, Avatar

**Done when:** you can sign up, verify, log in and out; an admin can open `/admin`; changing the brand name in the config changes it everywhere. CI is green.

---

## M2: Poker engine (pure library)

The most important code. No database, no network: `(state, action) → (newState, events)`.

**Cards & evaluation**
- [x] Card / deck types; Fisher–Yates shuffle with `crypto.randomInt`, plus a seeded RNG for tests
- [x] 7-card hand evaluator (best 5 of 7) returning rank + the 5 winning cards + a readable name ("Full house, Kings over Sevens")
- [x] Evaluator tests: every hand category, kickers, ties, wheel straight (A-2-3-4-5), steel wheel; all 2,598,960 five-card hands match the reference category counts

**Hand state machine**
- [x] Seats, dealer button, small/big blind, ante; heads-up blind rules (button posts SB, acts first pre-flop)
- [x] Betting rounds: pre-flop, flop, turn, river; turn order; round ends correctly
- [x] Legal actions per player: fold, check, call, bet, raise, all-in; **min-raise** rules; short all-in that does not reopen betting
- [x] Pots: main pot + **side pots**, split pots, odd-chip rule
- [x] Showdown order; uncalled bet returned; everyone-all-in runs out the board
- [x] Button movement and dead-button handling when players bust
- [x] `viewFor(state, playerId)`: the only way state leaves the engine; hides other players' hole cards and the deck
- [x] Hand history events (every action recorded, enough to replay)

**Tests**
- [x] Unit tests for every rule above, using fixed decks
- [x] Property tests (seeded random games): chips are never created or lost; pots always add up; only legal actions are accepted; no view ever leaks a hidden card
- [x] Simulator script `npm run sim`: thousands of random bot hands, checking all invariants (100,000 hands in ~10 s; `--views` adds leak checks)

**Done when:** the simulator plays 100,000 random hands with no invariant failures, and every edge case in intent §10 has a test.

---

## M3: Game server (WebSocket)

- [x] Always-on Node process (`src/server`), WebSocket server (`ws`), `/health` endpoint
- [x] Auth: the web app issues a short-lived signed token (`/api/game-token`); the server verifies it on connect
- [x] Table runtime: one engine instance per table, an action queue (one action at a time per table), server-side action timer + time bank, auto-fold/check on timeout
- [x] Message protocol (typed, zod-validated): `join_table`, `action`, `sit_out`, `sit_in` in; `table_state`, `your_cards`, `action_required`, `hand_result`, `error` out
- [x] Each client gets only its own `viewFor()` state; never broadcast raw state
- [x] Reconnect: on reconnect the client receives the full current view; disconnected players time out normally
- [x] Persistence: finished hands saved to `Hand` / `HandAction`; table snapshot saved after each hand so a server restart resumes the table
- [x] Rate limit and idempotency for incoming actions (duplicate clicks ignored)
- [x] Dev bots (dev/test only): fill seats on a practice table; practice tables only deal while a real person is seated
- [x] Tests: protocol validation, a client never receives another player's cards (asserted on every message in an integration test), timeout behaviour, restart recovery (`npm run test:integration`, real DB + WebSocket)

**Done when:** two browser tabs plus bots can play hands on a practice table through the server, and a server restart mid-session resumes correctly.

---

## M4: Poker table UI

- [ ] Wireframes for the table (desktop + mobile portrait) **(you review)**
- [ ] `/table/[id]`: oval table, up to 9 seats, avatars, stacks, dealer button, bets in front of players, pot(s), community cards
- [ ] Own hole cards; others face-down; showdown reveal with the winning 5 cards highlighted and hand name
- [ ] Action bar: Fold / Check / Call / Bet / Raise / All-in, bet slider, ½ pot / ¾ pot / pot buttons; only legal actions shown
- [ ] Turn timer ring + time bank; pre-action checkboxes (check/fold, call any)
- [ ] Hand log panel; blind level + next level timer
- [ ] Connection status ("Reconnecting…"), auto-reconnect
- [ ] Card/chip animations and sounds, with a toggle in settings
- [ ] Mobile layout (portrait, seats around the edge, action bar at the bottom)
- [ ] e2e test: a full hand against bots in the browser

**Done when:** you can play hands in the browser against dev bots on desktop and phone.

---

## M5: Contests + Sit & Go

**Data**
- [ ] Prisma models: `Contest`, `BlindStructure` (levels), `Registration`, `Table`, `Seat`, `Hand`, `HandAction`, `ContestResult`

**Admin**
- [ ] `/admin`: list of contests with status and players
- [ ] Create / edit / cancel contest: format (SNG/MTT), title, seats per table (2–9), starting stack, blind template, action timer, max players
- [ ] Blind structure templates: Turbo and Regular (editable levels table)

**Public**
- [ ] `/contests`: tabs Registering / Running / Finished / My contests, with format filter
- [ ] `/contests/[slug]`: structure, blind levels table, registered players, Register / Unregister
- [ ] Registration rules: verified email, one seat per user, max players, registration open/closed
- [ ] Home page: featured and running contests, how it works

**Sit & Go lifecycle**
- [ ] SNG starts automatically when the last seat fills; players get a "Your table is starting" notice and are taken to the table
- [ ] Blind levels advance on schedule (server clock)
- [ ] Bust-out → finishing position recorded; last player standing wins
- [ ] Contest status: REGISTERING → RUNNING → FINISHED (or CANCELLED)
- [ ] Tests: lifecycle transitions, registration rules, finishing order (including two players busting in the same hand: bigger starting stack places higher)

**Done when:** an admin creates a 6-seat SNG, you plus bots fill it, and it plays to a winner with correct finishing positions, without manual help.

---

## M6: Multi-table tournaments (MTT)

- [ ] Scheduled start time; registration closes at start (optional late registration for N levels)
- [ ] Random seating across tables at start
- [ ] **Table balancing**: after each hand, move players (from the big blind position) so table sizes differ by at most one
- [ ] **Table breaking**: close the shortest table when players fit into fewer tables; final table when everyone fits on one
- [ ] All tables share one blind clock
- [ ] Moves happen only between hands; moved players' clients follow them to the new table automatically
- [ ] Pause / resume a contest (admin)
- [ ] Tests: balancing and breaking algorithms (pure functions) with many field sizes; simulation of a 200-player MTT with bots to the final table

**Done when:** a 50-player MTT with bots runs from scheduled start to a single winner, with tables balancing and breaking correctly.

---

## M7: Results, hand history, profiles

- [ ] Live standings on the contest page: chip counts, players left, average stack
- [ ] Final results frozen at the end; podium highlighted; results page (place, player, hands played, biggest pot)
- [ ] Hand history list per contest (own hands) and a **hand replayer** (step through actions); other players' cards shown only if revealed at showdown
- [ ] Admin can view any hand with all cards (for disputes)
- [ ] Public profile `/u/[displayName]`: contests played, wins, top-3 finishes, best finish
- [ ] Stats: hands played, VPIP, PFR, showdown win % (computed from `HandAction`, cached per contest)
- [ ] Tests: stats calculations, replayer never leaks hidden cards

**Done when:** after a contest you can see the final standings, replay your hands and see your updated profile stats.

---

## M8: Chat, spectating, moderation

**Chat**
- [ ] Table chat over the same WebSocket; saved to `ChatMessage`
- [ ] Separate player chat and spectator chat (spectator messages are not shown to seated players)
- [ ] Limits: message length, rate limit, profanity filter
- [ ] Mute a player (for yourself), report a message

**Spectating**
- [ ] Watch any running table from the contest page; no hole cards, with a delay (e.g. one hand / 30 s)
- [ ] Busted players can keep watching their contest

**Admin / moderation**
- [ ] Live monitor: running contests, tables, players, current level
- [ ] Reports queue: delete messages, chat-ban users, remove a player from a contest
- [ ] Basic fair-play flags: same-IP registrations in one contest, shown to admins

**Done when:** players chat at a table, a visitor can watch with a delay, and an admin can handle a reported message.

---

## M9: Polish, load test, deploy

- [ ] Rules / How to play page (hand rankings, tournament rules, fair-play policy), privacy and contact pages, all using the brand config
- [ ] Accessibility pass (keyboard play, contrast, screen-reader labels on cards and actions; axe in e2e)
- [ ] Mobile pass on real phones
- [ ] Error pages, empty states, loading states
- [ ] **Load test:** simulated 200-player MTT + spectators against the game server; measure latency and memory
- [ ] Security review: the client never receives hidden cards, rate limits, input validation, admin routes
- [ ] Deploy: Vercel (web) + Railway/Fly.io (game server) + Neon; domain and email (Resend) for RiverKings **(you)**
- [ ] Production smoke test: real SNG with real people **(you + friends)**

**Done when:** the site is live, a real SNG has been played start to finish, and the success criteria in intent §10 are met.

---

## v1.1: Season points (after launch)

- [ ] `Season` model (e.g. monthly) and a points table per finishing position (admin-editable)
- [ ] Points awarded automatically when a contest finishes
- [ ] `/seasons` page: current season leaderboard, past seasons, player's points history on their profile
- [ ] Hand-for-hand play near the end of MTTs

---

## Risks to watch during the build

| Risk | Mitigation |
|------|------------|
| Engine bugs (side pots, min-raise, heads-up rules) | Pure engine, fixed-deck tests, invariant checks, 100k-hand simulator |
| Leaking hidden cards | Single `viewFor()` exit point; integration test checks every outgoing message |
| Game server restart loses a running table | Snapshot after every hand; resume on startup; deploy only between contests |
| One game server process is a single point of failure | Fine for v1 scale (~200 players per MTT); revisit if it grows |
| Real-time feel on slow mobile connections | Full per-viewer views (~1–2 KB) make reconnect trivial; generous action timer + time bank |
| Brand name creeping into code | Brand guard test in CI |
| Collusion / multi-accounting | Email verification, same-IP flags, admin hand review; deeper detection is out of scope |

---

## Next step

Write `design.md`: data model, engine state machine, WebSocket message protocol, table balancing algorithm and deployment layout. Then start M0/M1.
