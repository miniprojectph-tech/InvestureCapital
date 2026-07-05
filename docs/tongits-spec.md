# Community Tongits Room — Feature Spec

Status: **planning** (no code yet). This document is the source of truth for the
Community Tongits feature. Red-line it here; implementation follows it.

## Decisions locked (2026-07-05)

- **Economy: unified with the existing Reef game.** Tongits "Game Points" ARE the
  existing Reef points at `users/{uid}/game/state.points` (Cloud-Function-written,
  client-unforgeable). We extend `GameState` with `lockedPoints` and `rankingPoints`
  rather than building a separate wallet. Rewards reuse the existing `rewards` +
  `redemptions` collections (add a `category` field to separate "AI tool" rewards).
  Leaderboard reuses `leaderboard/{uid}`, extended to daily/weekly/monthly/all-time.
- **Realtime: hybrid RTDB + Firestore.** Firebase Realtime Database for the live,
  ephemeral game state + presence (`onDisconnect` auto-detects drops). Firestore for
  durable records (rooms, matches, results, chat history, transactions, wallets,
  leaderboards). Cloud Functions are the referee: hold the deck + hidden hands,
  validate every move, resolve winners, move points.
- **Delivery: phased.** Phase 1 (rooms + economy, no gameplay) → Phase 2 (engine +
  table) → Phase 3 (leaderboards + rewards + admin).
- **Isolation is mandatory.** Everything lives under `/tongits/*` (route-level
  code-split) with its own collections and screen-scoped listeners, so users not
  playing pay zero bundle/listener cost and the main app is unaffected.

Points-only, not cash, not withdrawable, not convertible. Community-friendly wording
only (Create room, Join room, Challenge with Game Points, Climb the leaderboard,
Redeem free AI tools). Avoid: casino, betting, real money, withdraw, deposit, cashout.

---

## Part A — Standard Philippine Tongits ruleset (draft v1)

Precise enough to implement deterministically. Items marked ⚙️ are house choices.

### Setup
1. 3 players, standard 52-card deck, no jokers.
2. Dealer = room creator (seat 0). Deals **12** cards to each player, **13** to
   themselves; the rest (~15) form the face-down **stock**. No starting discard.
3. Dealer plays **first** and does **not** draw on their opening turn.

### Card values (hand scoring — lower is better)
4. Ace = 1, 2–10 = pip, J/Q/K = 10.
5. Runs: Ace **low only** (A-2-3 valid; Q-K-A not). ⚙️ *(open: allow Ace high?)*

### A turn, in order
6. **Draw** one card: (a) top of **stock**, or (b) top of **discard** — (b) allowed
   only if the taken card is **immediately** used in a new meld or sapaw this turn.
7. **Meld / sapaw** (optional, any number):
   - Set = 3–4 same rank. Run = 3+ consecutive same suit.
   - Sapaw = add valid card(s) to **any** exposed meld (yours or opponents').
8. **Discard** one card to end the turn — unless the hand is now empty (Tongits).

### Round endings
9. **Tongits (instant win):** reach 0 cards → immediate win. `tongits_win`. Biggest bonus.
10. **Call / "Tumba":** on your turn, after drawing, if you have ≥1 exposed meld you may
    **Call** instead of discarding → showdown, **lowest hand points wins**
    (`lowest_points_win`). ⚙️ Tie-break: **caller wins ties** (v1 recommendation) vs.
    stricter "caller burned if not strictly lowest."
11. **Stock exhausted:** round ends after that turn → showdown, lowest wins (`draw_win`).
12. **Cancelled / disconnect:** `cancelled` / `player_disconnected`.

### Optional
13. ⚙️ **Secret Tongits:** win by Tongits having never exposed a meld until the winning
    turn → extra ranking points. Include?

### Points & payout (unified economy)
14. Challenge = C points/player (min **50**). Pool = **3 × C**, locked only after all 3 confirm.
15. Winner takes the whole pool (net **+2C**); each loser loses **C**. Never negative
    (enforced at lock time).
16. Ranking points (admin-configurable), e.g. `tongits_win +30`, `lowest/draw_win +20`,
    `loss +2`, `secret_tongits +50`. Separate from spendable points; feed leaderboards.

### Cancel / return
17. Points lock **only** when all 3 confirm. Leaving **before** that = no lock, no penalty.
    Cancelled/abandoned **after lock but before first move** → all locks returned. After
    the first move, the game must resolve; a disconnect becomes a forfeit → remaining
    players resolve by lowest hand. ⚙️ *(forfeit specifics = Phase 2 detail.)*

### Open ⚙️ items awaiting sign-off
- Ace low-only vs. Ace high/low for runs.
- Call tie-break (caller-wins-ties vs. burned).
- Secret Tongits bonus: yes/no.
- Exact forfeit/disconnect resolution (Phase 2).

---

## Part B — Phased roadmap

### Phase 1 — Room system + economy plumbing (no gameplay)
Everything around the game, fully testable, unblocked by the ruleset.

**Firestore (mutated via Cloud Functions only; clients read-only)**
- `game_rooms/{code}` — doc id = unique room code (retry-on-collision). Fields:
  `creatorUserId, challengePoints, maxPlayers:3, status (open|confirming|ready|cancelled|in_game|completed), chatEnabled, players{} (uid→{name, avatar, seat, isReady, agreedToChallenge, joinedAt}), createdAt, updatedAt, startedAt, completedAt`.
- `game_rooms/{code}/chat/{id}` — `uid, name, message, createdAt`.
- `game_chat_reports/{id}` — reporter, roomCode, messageId, reason, createdAt.
- `game_point_transactions/{id}` — audit (`challenge_points_locked|returned|won|lost`, …).
- Wallet: reuse `users/{uid}/game/state`, add `lockedPoints` (and later `rankingPoints`).

**Cloud Functions**
- `createTongitsRoom({challengePoints})` — min 50 + enough points; seats creator; returns code.
- `joinTongitsRoom({code})` — validate: open, not full, not already joined, not started, enough points.
- `setReady({code, ready})`.
- `confirmChallenge({code})` — when all 3 agree, atomically move `points → lockedPoints`
  for each + write transactions.
- `leaveRoom({code})` / `cancelRoom({code})` — return locks if pre-start; cancel empty/creator-left rooms.

**Firestore rules**
- `game_rooms`: read if signed-in (public lobby); client writes denied (Functions only).
- `chat`: create if signed-in AND in that room's `players` map; read if a player.

**Screens (under `/tongits/*`, code-split)**
- `/tongits` — dashboard: points balance, Create Room, Join-by-code, live lobby list of
  open rooms (limited ~20). Later: rank, games, win rate, match history, rewards.
- `/tongits/room/[code]` — 3 seats + avatars, Ready, challenge amount + confirm status,
  chat box, copy-code, Leave, start status.
- Nav: new "Community" group (or under the existing Reef/Games group).

**Performance guardrails**
- Lobby query limited + only listens on the lobby screen; room/chat listeners only on the
  room screen. Elsewhere in the app: no Tongits listeners, none of this JS loaded.

### Phase 2 — Tongits engine + table
Server-authoritative deal/draw/discard/meld/sapaw/call, hidden-hand model (public state
in room; each hand private to its player), turn timer, disconnect forfeit, match result +
payout. RTDB carries live state + presence. This is the large, careful phase — gated on
the ruleset above being finalized.

### Phase 3 — Leaderboards + rewards + admin
Daily/weekly/monthly/all-time leaderboards (scheduled aggregation), unified rewards +
redemption (reuse existing `rewards`/`redemptions` + category), admin room/report/audit
dashboards, suspend players, cancel rooms, point-transaction audit.

---

## Existing infrastructure we reuse (don't rebuild)

- Points wallet → `users/{uid}/game/state.points` (Function-written). Add `lockedPoints`, `rankingPoints`.
- Rewards / redemptions → existing `rewards` + `redemptions` collections (+ `category`).
- Leaderboard → existing `leaderboard/{uid}` (extend periods).
- Cross-user, server-authoritative point movement → same pattern as Reef `castLine`/
  `claimQuest` and the referral `onReferralClaim` credit.

## Security (must hold across all phases)
Prevent: joining full/started rooms, joining twice, starting without 3 ready + all agreed,
negative balances, duplicate rewards/deductions, controlling another player's turn,
chatting in a room you didn't join, editing results, rewards from cancelled games. All
important actions validated on the backend (Functions), never trusted from the client.
