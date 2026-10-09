# Intent: Poker Contest Website ("RiverKings")

## 1. Purpose

Build a website where people compete in **play-money No-Limit Texas Hold'em contests** (tournaments). Each player gets the same starting chip stack, plays real-time hands against other people at virtual tables, and is ranked by finishing position. **No real money is wagered or won.**

The goal is a fun, fair, skill-based competition that:
- lets beginners learn poker without risking money,
- lets experienced players prove their skill against others,
- is simple for an organizer to set up and run.

## 2. Target Users

| Role | Description |
|------|-------------|
| **Player** | Signs up, registers for contests, plays hands, tracks rank and stats. |
| **Organizer / Admin** | Creates contests, sets structure (blinds, stacks, seats), monitors tables, handles disputes. |
| **Visitor** | Browses public contests, lobbies and leaderboards without an account. |

## 2a. Branding (configurable)

- Working name: **RiverKings**.
- **The brand must never be hardcoded.** Name, tagline, logo, favicon, colours, support email, domain and email sender name all come from **one brand config** (e.g. `src/config/brand.ts`, with values overridable by environment variables such as `NEXT_PUBLIC_BRAND_NAME`).
- All UI text, page titles, metadata, emails and legal pages read from this config. Logos/icons live in one folder and are referenced through the config.
- Colours are theme tokens (CSS variables), not brand-specific class names.
- Code identifiers, database names and package names stay generic (e.g. `poker`, not `riverkings`).
- A rebrand = edit the config + swap the logo files, with no other code changes. A test checks that the brand name doesn't appear anywhere in `src/` outside the config.

## 3. Game (v1): No-Limit Texas Hold'em only

- One variant: **No-Limit Texas Hold'em (NLHE)**, 2–9 players per table.
- Standard rules: blinds (+ optional ante), pre-flop / flop / turn / river betting rounds, showdown, side pots for all-ins.
- Hand evaluation, shuffling and dealing happen **only on the server**. The client never sees other players' hole cards until showdown.
- Shuffle uses a cryptographically secure RNG (Fisher–Yates with `crypto.randomInt`).

## 4. Core Concepts

- **Contest**: a tournament with a scheduled start, a chip structure and rules. Two formats:
  - **Sit & Go (SNG)**: starts as soon as the table fills (e.g. 6 or 9 players), single table.
  - **Scheduled Multi-Table Tournament (MTT)**: starts at a fixed time; players are spread across tables and tables are balanced / merged as players bust.
- **Table**: a set of seats running hands. One server-side game engine instance per table.
- **Hand**: one deal from shuffle to pot award. Every action is recorded (hand history).
- **Blind structure**: levels that increase the blinds on a timer (e.g. every 10 minutes).
- **Chips**: tournament chips only, with no cash value. Everyone starts with the same stack.
- **Leaderboard**: live chip counts during the contest; final standings by bust-out order (last player standing wins).
- **Season points** (v1.1): points awarded per finish (e.g. 1st = 100, 2nd = 70, 3rd = 50 …), summed over a season (e.g. a month) into an overall ranking across contests.

## 5. MVP Scope (Version 1) — Features

### Accounts (same approach as TradingContest)
This is a **new, standalone project** with its own user database; players sign up here separately. The login code follows the same pattern as `TradingContest` (Auth.js / NextAuth v5, JWT sessions, bcrypt passwords, Prisma `User` + `VerificationToken` models), rebuilt in this repo.
- Sign up with email + password + unique display name.
- Email verification link (resend with cooldown).
- Log in / log out; optional Google login when env vars are set.
- Rate limits on sign-up and login; safe redirect after login.
- Roles: `USER` / `ADMIN` (`make-admin` script).
- Basic profile: display name, avatar.

### Contest lobby
- List of upcoming, registering, running and finished contests (filters by format and status).
- Contest detail page: format, start time, starting stack, blind structure table, seats, registered players.
- Register / unregister before the start (late registration window optional per contest).
- Countdown to start; "starting soon" notice.

### Poker table (real-time)
- Table view: seats, avatars, stacks, dealer button, blinds, pot(s), community cards, own hole cards.
- Actions: **Fold, Check, Call, Bet, Raise, All-in**, with a bet slider and quick buttons (½ pot, ¾ pot, pot).
- **Action timer** per turn (e.g. 20 s) plus a time bank; auto-fold (or auto-check) on timeout.
- Sitting out / disconnected players are auto-folded but keep their seat and stack (blinded away).
- Reconnect: refreshing the page or losing connection returns you to your seat with full state.
- Side pots and split pots calculated and shown correctly.
- Showdown: reveal hands, highlight the winning 5 cards, name the hand ("Full house, Kings over Sevens").
- Pre-action checkboxes (check/fold, call any).
- In-table hand log (last few actions) and a blinds-level / next-level timer.
- **Table chat**: text chat per table for seated players and spectators; message length and rate limits; basic profanity filter; mute a player (for yourself); report message; admin can delete messages and chat-ban users. Spectator chat is kept separate from player chat so watchers can't pass hidden information to players.
- Sound effects and card/chip animations (toggleable).

### Tournament engine
- Blind levels advance automatically on schedule.
- Bust-out detection and finishing positions.
- **MTT table balancing**: move players to keep tables even; break tables as the field shrinks; final table.
- Contest runs start-to-finish with no manual intervention.

### Leaderboard & results
- Live chip-count standings during the contest.
- Final standings frozen at the end; winner / podium highlighted.
- Contest results page: place, player, hands played, biggest pot won.

### Hand history
- Every hand stored (seats, cards, actions, pots, winners).
- Players can replay their own hands after they finish (other players' hidden cards stay hidden unless shown at showdown).

### Player profile & stats
- Public profile `/u/[displayName]`: contests played, wins, top-3 finishes, best finish.
- Simple stats: hands played, VPIP, PFR, showdown win %.

### Spectating
- Visitors and busted players can watch running tables (no hole cards shown, small delay to prevent cheating).

### Admin
- Create, edit, cancel contests (format, start time, seats per table, starting stack, blind structure template, late reg, max players).
- Blind structure templates (Turbo, Regular).
- Live monitor: running tables, players, current level.
- Pause / resume a contest; remove a player (abuse).
- Chat moderation: review reported messages, delete messages, chat-ban users.
- View any hand history (for disputes).

### Site
- Home page: featured / live contests, call to action.
- Rules page (poker hand rankings, tournament rules, fair-play policy).
- Privacy, contact pages.
- Light / dark mode toggle; responsive desktop + mobile table layout.

## 6. Out of Scope for MVP (Future Ideas)

- **Real money of any kind**: buy-ins, prizes, deposits, withdrawals (gambling licensing).
- Other variants: Pot-Limit Omaha, Short Deck, Limit Hold'em.
- Cash games (ring games) with re-buys.
- Re-entry / re-buy / add-on tournaments, bounty (knockout) tournaments.
- Private / invite-only home games with join codes.
- Emojis / reactions, friends, following players.
- Achievements, badges.

### Planned for v1.1
- **Season points + season leaderboard** (points table per finish, monthly season, overall ranking page).
- Hand-for-hand play near the money / final table.
- Bots / AI opponents, training mode, hand-strength hints.
- Collusion detection beyond basic checks.
- Native mobile app.

## 7. Fairness & Rules

- The server is the only source of truth: deck, cards, stacks, pots and turn order live on the server; the client only sends intents (fold/call/raise X), which are validated.
- Hole cards are sent only to their owner; other players' cards are sent only at showdown.
- Secure RNG for shuffling; each hand's deck is logged for audit.
- One account per person, one seat per contest; email verification required to register for contests.
- Same IP / multi-account checks at registration; basic collusion flags (players repeatedly soft-playing each other) for admin review.
- Spectator view is delayed so it can't be used to cheat.
- Disconnects don't stop the game: the timer runs and the player is auto-folded.

## 8. Tech Stack (proposed — same as TradingContest)

- **Frontend**: Next.js (React) + TypeScript + Tailwind CSS
- **Backend**: Next.js server actions / API routes for accounts, lobby, admin
- **Game server**: an always-on Node **worker** (like TradingContest's worker) running the table engines and a **WebSocket** server for real-time play
- **Database**: PostgreSQL on **Neon** with Prisma ORM. No Docker.
- **Auth**: Auth.js (NextAuth), same pattern as TradingContest; game-server WebSocket authenticates with a short-lived signed token issued by the web app.
- **Email**: SMTP in dev, Resend at launch
- **Testing**: Vitest (engine unit tests: hand evaluator, side pots, betting rules), Playwright (e2e)
- **Hosting**: Vercel (website) + Railway/Fly.io (game server) + Neon

## 9. Key Pages

1. Home: featured / live contests.
2. Login / Sign up / Verify email.
3. Contest lobby (list).
4. Contest detail (structure, players, register, live standings).
5. Poker table.
6. Contest results.
7. Hand history / replayer.
8. Player profile & stats.
9. Rules / How to play.
10. Admin: contests, blind templates, live monitor.

## 10. Success Criteria for MVP

- A user can sign up, register for a contest, play it to the end, and see their final place.
- The game engine handles all standard situations correctly (all-ins, side pots, split pots, heads-up blinds, timeouts, disconnects), proven by unit tests.
- No player can ever see another player's hidden cards.
- An admin can create an SNG or MTT and it runs start-to-finish without manual intervention.
- Works well on desktop and mobile browsers.

## 11. Decisions Log

| Date | Decision |
|------|----------|
| 2026-10-09 | Project started. Play-money **No-Limit Texas Hold'em** tournaments only. |
| 2026-10-09 | Login / logout / sign-up / email verification follow the **same approach** as TradingContest (Auth.js, Prisma `User`, `VerificationToken`), rebuilt here. |
| 2026-10-09 | **Standalone project**: own database, separate sign-ups (no shared accounts with TradingContest). |
| 2026-10-09 | v1 formats: **Sit & Go and scheduled MTT**. |
| 2026-10-09 | **Table chat in v1** (with moderation). |
| 2026-10-09 | Working name **RiverKings**, set in a single brand config, never hardcoded, so the site can be rebranded easily. |
| 2026-10-09 | **No real money** (no buy-ins, no prizes) in v1. |
| 2026-10-09 | **Season points in v1.1**, not v1. |

## 12. Open Questions

- **Expected players per contest**: design assumes up to ~200 per MTT for v1.
