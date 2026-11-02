# Profile dashboard (`/me`): identity, credits, and practice play history

## Context

A signed-in user has no page of their own. Firebase auth, the `users` table, and the
credits ledger all exist, but nothing in `src/` shows a person their own account:
`AccountSwitcher` offers sign-in, sign-out, and Asgard for gods, and that is the
whole surface. Gameplay is entirely unpersisted — tickets, draws, players, and
winnings live as local state in `src/App.btsx` and die with the tab.

Asked for: a route where logged-in users view a profile dashboard showing identity,
credits, and play history.

Decisions made in brainstorming:

| Topic | Decision |
|---|---|
| Path | **`/me`**, inside the existing game shell (`App`'s `Outlet`), as `/analytics` already does |
| Signed out | **Sign-in prompt in place of the panels.** No redirect — a shared `/me` link must not look broken |
| Play history | **Every play, practice and real.** Practice is built now; real is deferred |
| Practice row | **One row per resolved draw.** Not per ticket, not per session |
| Real tickets | **Deferred** to the money engine's ticket phase; the panel is designed in with an empty state |
| Data freshness | **Live.** A new `useConvexQuery` hook over `convexClient.onUpdate` |
| Stats | **Computed on the client** from raw rows, in a pure module. Convex stores and returns; it does not aggregate |
| Practice sync | **Automatic whenever signed in.** No opt-in toggle (alternative recorded below) |

### Why real plays are deferred

A credit-backed ticket is not a bigger practice row. It needs a purchase that
`ticketHold`s against the user's wallet, a **server-authoritative draw** (a
client-drawn ball must never pay a real prize), and settlement that posts
`ticketCapture` or `prize` per ticket. `convex/ledger/d.ts` already defines those
kinds and its `ledgerRefSchema` comment reserves room for tickets, so this spec
adds nothing to the ledger's design and blocks none of it. The dashboard ships
with a real-plays panel that is empty until that phase lands.

### Out of scope (room left for each)

Real/credit-backed ticket history, server draws and settlement; editing profile
details (contact changes are god-only today, per `convex/accounts/contacts.ts`);
cross-device sync of practice plays beyond what the table gives; leaderboards or
any view of another user's data; practice-sync opt-out toggle.

**Recorded alternative:** if silent persistence of gameplay is later unwanted, a
`practiceSync` boolean on the `users` row plus one guard at the write site is the
whole change. Nothing in this design depends on it being absent.

Status: design approved 2026-11-02. Implementation plan (writing-plans) comes next,
before any code.

---

## Architecture

```
  src/App.btsx evaluateTickets()            src/pages/profile-page.btsx
  (the one point a draw resolves)            (Masthead · Panel · StatTile)
            │ void, fire-and-forget                   │
            │ only when signed in                     │ useConvexQuery (live)
            ▼                                         ▼
   convex/plays/m.ts record()        users.q.current · ledger.q.myWallet
            │  caps + prunes          ledger.q.myLedgerHistory · plays.q.mine
            ▼                                         │
      practicePlays  ◄───────────────────────────────┘
                                          raw rows ──► src/lib/profile/stats.ts
                                                       (pure; rows in, numbers out)
```

Convex stores and returns; it never aggregates. Stats are a pure function of rows,
so they are unit-testable without a deployment and cheap to change when the
real-plays panel arrives.

## Data model (`convex/plays/d.ts`)

**`practicePlays`** — one resolved draw, owned by the signed-in user who played it.
In party mode the other players are local fictions (`PLAYER_COLORS` seeds them
client-side), so the row belongs to the one real user regardless of mode.

- `userId: Id<'users'>`
- `game`: a **new** `practiceGame` validator — the five `GAME_IDS` literals (`'6/42'`…`'6/58'`).
  `resultGame` in `convex/resultValidators.ts` must **not** be reused: it is the PCSO
  vocabulary (`'lotto'`, `'mega'`, …), a different naming of games from `src/lib/games.ts`.
- `mode: 'solo' | 'party'`
- `isOfficial: boolean` — a pasted PCSO draw checked against own numbers, vs a simulated one
- `drawnBalls: number[]`
- `seed: { clientSeed: string, serverSeed: string, nonce: number, rolls: number } | null` —
  the `DrawSeed` shape from `src/lib/rng.ts`, which makes a simulated draw reproducible.
  `null` for a pasted official draw, which takes its numbers from PCSO rather than the generator.
- aggregates over **every** ticket: `ticketCount`, `spent`, `won`, `winCount`, `bestHits`
- `tickets`: **at most 50**, `{ numbers, betType, cost, hits, prize, playerName }`,
  ranked by prize then hits
- `drawnAt: number`
- index `by_userId_and_drawnAt`

**Why the cap is load-bearing:** `MAX_TICKETS` is `2_000_000` (`src/lib/lotto.ts:11`).
An unbounded `tickets` array breaks both Convex limits — 8192 array entries and the
1MB document ceiling — so the array is capped at 50 while the aggregates are computed
over all of them. Totals stay true; the list shows the plays worth seeing.

## Write path

`evaluateTickets` (`src/App.btsx:376`) is the single point where a draw resolves, and
it already computes the draw, each ticket's `hits` and `prizeWon`, the mode, and the
seed. The write goes at its end, after the existing state updates:

- `void`, fire-and-forget. It must never block the win animation, confetti, or sound.
- Fires only when `convexClient` exists **and** Firebase has a signed-in user.
- Failures are logged to the console and surfaced nowhere. A lost practice row is not
  worth a toast.
- No retry, therefore no duplicate rows. No idempotency key (contrast `post()`, where
  money makes retries mandatory).
- Shaping the payload — ranking and capping tickets, computing aggregates — happens in
  a pure helper in `src/lib/profile/` so it is tested without a browser.

`convex/plays/m.ts record()`: validates args, resolves the caller's `users` row via
`getUserByTokenIdentifier` (never a `userId` from the client), inserts, then **prunes
to the newest 200 rows for that user**, deleting the excess. That bounds a long
session and keeps the history read cheap. It takes its own cap defensively — a client
is free to lie about array length.

## Read path

**New hook `src/hooks/use-convex-query.ts`.** Nothing in the app subscribes to Convex
today; every call site uses one-shot `convexClient.query`. The hook wraps
`convexClient.onUpdate`: subscribe on mount, re-subscribe when args change (keyed by a
stable serialization), unsubscribe on cleanup, and return `undefined` while loading or
when there is no client or no auth. It is the only new infrastructure here and serves
every later Convex-backed surface.

**Reads:**

- `api.users.q.current` — exists, returns the `users` doc or `null`
- `ledger.q.myWallet` — **new**, `wallets.by_userId` index, returns the user wallet doc or `null`
- `ledger.q.myLedgerHistory` — **new**, newest 20 entries for that wallet, each joined
  to its transaction's `kind` and `memo`, exactly the shape and bounded-read pattern
  `partnerFloatHistory` already uses
- `plays.q.mine` — **new**, `by_userId_and_drawnAt` descending, `limit` clamped server-side

Every new query derives identity from `ctx.auth.getUserIdentity()`, returns an empty
result rather than throwing when signed out, and reads only the caller's own rows.
`walletEntries` is left alone: it is paginated, and pagination does not fit a live
subscription on a fixed panel.

## Stats and page composition

`src/lib/profile/stats.ts` — rows in, numbers out: plays, credits spent, credits won,
net, win rate, hit distribution, best draw, favourite game. No Convex import, no
component import.

`src/pages/profile-page.btsx`, lazy-loaded, reusing `src/components/overview`
(`Masthead`, `Panel`, `StatTile`, `Distribution`, `AreaChart`) so the page speaks the
same visual vocabulary as the Asgard console:

1. **Identity** — name, email, avatar, verified state, member since (`createdAt`)
2. **Credits** — balance from `myWallet` (absent wallet reads as `0`, not an error),
   then recent movements from `myLedgerHistory`
3. **Practice** — stat tiles and a hit distribution from `stats.ts`
4. **Recent plays** — the practice rows, newest first, each showing game, balls,
   tickets, hits, and winnings
5. **Real plays** — empty state explaining that credit-backed tickets are coming

Signed out, all five panels are replaced by a single sign-in prompt reusing the
`signInWithGoogle` path `AccountSwitcher` already calls.

## Routing

- `createAppRouteTree()` in `src/lib/analytics-router.ts` gains a `/me` route with a
  `lazyRouteComponent`, matching how the asgard pages are loaded.
- `src/App.btsx:581` currently hides the game grid with `pathname !== "/analytics"`.
  That becomes `isAppPagePath(pathname)` in `src/lib/routing/app-pages.ts` with its own
  test, so the third such page does not mean a third hardcoded string.
- `AccountSwitcher` gains a "Profile" action beside the existing Asgard entry,
  available to any signed-in user.
- Asgard and admin trees are untouched: `/me` is a page of the app, not a console.

## Error handling and edge cases

- **No Convex URL / Firebase unconfigured:** the page renders identity from Firebase
  alone and the data panels read as empty. The app already degrades this way.
- **Signed in, no `users` row yet:** `ensureCurrent` runs on auth change; until it
  lands, panels are empty rather than broken.
- **No wallet:** balance `0`, not an error. A user who has never been allocated credits
  has no wallet row by design.
- **Panels fail independently.** A failed plays read leaves that panel empty with the
  rest of the page intact.
- **Sign-out while viewing:** subscriptions drop and the page falls back to the
  sign-in prompt.
- **Party mode:** the row is owned by the signed-in user; local player names ride
  inside the capped ticket details.
- **Official-draw check:** `isOfficial: true` rows are counted separately from
  simulated ones wherever stats would otherwise mix them.

## Critical files

- **New:** `convex/plays/{d,q,m}.ts`, `src/pages/profile-page.btsx`,
  `src/hooks/use-convex-query.ts`, `src/lib/profile/{stats,record}.ts`,
  `src/lib/routing/app-pages.ts`, plus tests beside each
- **Modified:** `convex/schema.ts` (register `practicePlays`), `convex/ledger/q.ts`
  (two queries), `src/lib/analytics-router.ts` (the route), `src/App.btsx`
  (`evaluateTickets` write, the `isAppPagePath` call), `src/components/AccountSwitcher.btsx`
  (Profile action)
- **Reused:** `getUserByTokenIdentifier` (`convex/users/q.ts`), `findPartnerWallets`'s
  join pattern (`convex/ledger/q.ts`), `src/components/overview/*`,
  `src/lib/format.ts`, `src/lib/overview/metrics.ts`, `rankTickets` (`src/lib/lotto.ts`)
- Read `convex/_generated/ai/guidelines.md` before the Convex work (CLAUDE.md requirement):
  object-form functions, `args` **and** `returns` validators on every function, indexes
  rather than `filter`, `schema.doc()` for document returns.

## Verification

`bun run test` (`bun test src` for the pure modules, `vitest` + `convex-test` for
Convex, matching `convex/ledger/api.test.ts`):

- **Stats (`bun test`):** empty rows give zeroes, not `NaN`; win rate and net match
  hand-computed fixtures; official and simulated rows are separated; hit distribution
  sums to `ticketCount`.
- **Payload shaping (`bun test`):** a draw with 500 tickets produces a row with 50
  ticket details and aggregates computed over all 500; ranking prefers prize then hits.
  (500 keeps the test fast; the cap is a constant, so it does not care how far over it goes.)
- **Routing (`bun test`):** `isAppPagePath` covers `/me`, `/analytics`, trailing
  slashes, and rejects `/`, `/admin`, and the asgard paths.
- **Mutation (`convex-test`):** signed out is rejected; `userId` is taken from the
  identity, not from args; a `tickets` array longer than the cap is truncated
  server-side; the 201st row prunes the oldest and leaves exactly 200.
- **Queries, negative cases (`convex-test`):** user A cannot read user B's wallet,
  ledger history, or plays; signed out returns empty rather than throwing; `limit` is
  clamped.
- **End to end:** `bun run typecheck`, then `bun run dev` with `npx convex dev`, sign
  in, resolve a draw, and confirm in the browser pane that `/me` updates live without a
  reload — which is the whole point of the subscription.
