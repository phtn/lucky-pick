# Profile Dashboard (`/me`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/me` route where a signed-in user sees their identity, credit balance and movements, and a live history of their practice plays.

**Architecture:** Convex stores and returns; it never aggregates. A draw resolving in `src/App.btsx` fires one shaped, capped row at `plays.m.record`. The page subscribes to four queries through a new `useConvexQuery` hook over `convexClient.onUpdate`, and all statistics are a pure function of the returned rows.

**Tech Stack:** Convex `^1.46`, Octane components (`.btsx`), TanStack Router (`@octanejs/tanstack-router`), Firebase auth, `convex-test` + vitest for Convex, `node:test` + `bun test` for pure modules.

**Spec:** `docs/superpowers/specs/2026-11-02-profile-dashboard-design.md`

## Global Constraints

- Read `convex/_generated/ai/guidelines.md` before any Convex work (CLAUDE.md requirement).
- Every Convex function is object-form with **both** `args` and `returns` validators; use indexes, never `filter`; use `schema.doc('table')` for whole-document returns.
- Identity always comes from `ctx.auth.getUserIdentity()` then `getUserByTokenIdentifier` — never a `userId` passed by the client.
- A signed-out read returns an empty result (`null`, `0`, `[]`); it does not throw.
- `practicePlays.tickets` holds **at most 50** entries; `practicePlays` rows are pruned to the newest **200 per user**.
- Game identifiers are `GameId` (`'6/42' | '6/45' | '6/49' | '6/55' | '6/58'`). `resultGame` in `convex/resultValidators.ts` is the PCSO vocabulary and must **not** be used here.
- Pure modules under `src/` get `node:test` + `node:assert/strict` tests (run by `bun test src`). Convex gets `convex-test` + vitest (`convex/**/*.test.ts`). There is no component test infrastructure; `.btsx` work is verified by `bun run typecheck` and the browser.
- The write from `evaluateTickets` is `void` and fire-and-forget: it never blocks the draw, and a failure logs to the console and surfaces nowhere.

## Review Focus

These are implied by the spec but not covered by any task's happy-path tests. Each has a test added to the task that owns the code.

1. **A draw with no tickets** must write no row at all, or history fills with empty plays (Task 3).
2. **Tickets for a different game than the one drawn** must not reach `spent`/`won` — `evaluateTickets` skips them, so the shaper must too (Task 3).
3. **Tickets already settled by an earlier draw** (`status !== 'pending'`) must not be re-counted (Task 3).
4. **`limit` of `0`, a negative, or `10_000`** must be clamped server-side, not trusted (Task 2).
5. **Two draws resolving in the same millisecond** must still produce a stable newest-first order (Task 2).

---
### Task 1: App-page route predicate

**Files:**
- Create: `src/lib/routing/app-pages.ts`
- Test: `src/lib/routing/app-pages.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `APP_PAGE_PATHS: readonly string[]`, `isAppPagePath(pathname: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/routing/app-pages.test.ts — node:test + node:assert/strict
describe('app page paths', () => {
  test('recognizes the pages that replace the game grid', () => {
    assert.equal(isAppPagePath('/me'), true)
    assert.equal(isAppPagePath('/analytics'), true)
    assert.equal(isAppPagePath('/me/'), true)
  })
  test('leaves the game and the consoles alone', () => {
    assert.equal(isAppPagePath('/'), false)
    assert.equal(isAppPagePath('/admin'), false)
    assert.equal(isAppPagePath('/asgard'), false)
    assert.equal(isAppPagePath('/mexico'), false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/routing/app-pages.test.ts`
Expected: FAIL — cannot find module `./app-pages`

- [ ] **Step 3: Implement `isAppPagePath(pathname: string): boolean` in `src/lib/routing/app-pages.ts`**

`APP_PAGE_PATHS` is `['/me', '/analytics']`. Normalize a trailing slash the way `usePathname` in `src/lib/navigation.ts` does before comparing, so both agree on `/me/`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/routing/app-pages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/routing/app-pages.ts src/lib/routing/app-pages.test.ts
git commit -m "feat(routing): name the app pages that replace the game grid"
```

---

### Task 2: `practicePlays` table, `record` mutation, `mine` query

**Files:**
- Create: `convex/plays/d.ts`, `convex/plays/m.ts`, `convex/plays/q.ts`, `convex/plays/plays.test.ts`
- Modify: `convex/schema.ts`

**Interfaces:**
- Consumes: `getUserByTokenIdentifier` from `convex/users/q.ts`
- Produces:
  - `convex/plays/d.ts`: `practiceGameSchema`, `practiceSeedSchema`, `practiceTicketSchema`, `practicePlayFields`, `TICKET_DETAIL_LIMIT = 50`, `PLAY_HISTORY_LIMIT = 200`, `DEFAULT_PLAY_PAGE = 50`
  - `api.plays.m.record` — args are `practicePlayFields` without `userId`; returns `v.union(v.id('practicePlays'), v.null())`
  - `api.plays.q.mine` — args `{ limit: v.optional(v.number()) }`; returns `v.array(schema.doc('practicePlays'))`

- [ ] **Step 1: Write the failing test**

```ts
// convex/plays/plays.test.ts — convexTest(schema, modules), identities from '../lib/testIdentities'
test('record refuses a signed-out caller and returns null', ...)
  // expect(await t.mutation(api.plays.m.record, play)).toBe(null)
test('record owns the row by identity, not by any client-supplied id', ...)
  // the stored row's userId is ana's users._id
test('record truncates a ticket detail array longer than the cap', ...)
  // 90 details in, 50 stored, aggregates untouched
test('record prunes to the newest 200 rows per user', ...)
  // 201 inserts -> exactly 200 rows, the oldest drawnAt gone
test('record keeps one user\'s pruning off another user\'s rows', ...)
  // ana at the cap, ben still has his 3
test('mine returns a user\'s own rows newest first', ...)
test('mine returns an empty array when signed out or with no plays', ...)
test('mine never returns another user\'s rows', ...)
  // ben's query cannot see ana's plays
test('mine clamps limit to the page bounds', ...)
  // limit 0 -> DEFAULT_PLAY_PAGE, limit -5 -> DEFAULT_PLAY_PAGE, limit 10_000 -> at most PLAY_HISTORY_LIMIT
test('mine orders same-millisecond draws stably, newest first', ...)
  // three rows sharing one drawnAt come back in a deterministic order
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/plays/plays.test.ts`
Expected: FAIL — `api.plays` does not exist

- [ ] **Step 3: Define the table in `convex/plays/d.ts` and register it in `convex/schema.ts`**

Follow `convex/ledger/d.ts` for style: exported field objects, not inline `defineTable` literals. `practiceGameSchema` is a `v.union` of the five `GAME_IDS` literals. Fields are those in the spec's data model. Register as `practicePlays` with index `by_userId_and_drawnAt` on `['userId', 'drawnAt']`.

- [ ] **Step 4: Implement `record` in `convex/plays/m.ts` and `mine` in `convex/plays/q.ts`**

`record`: resolve the caller's `users` row, returning `null` when there is no identity or no row; truncate `tickets` to `TICKET_DETAIL_LIMIT` (the client already caps, but the server does not trust it); insert; then take `PLAY_HISTORY_LIMIT + 1` rows on the index in ascending order and delete the excess oldest.

`mine`: clamp `limit` into `[1, PLAY_HISTORY_LIMIT]`, defaulting to `DEFAULT_PLAY_PAGE`, then read the index in descending order. Ordering within one `drawnAt` is settled by the index's `_creationTime` tiebreak, which is what makes same-millisecond draws deterministic.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run convex/plays/plays.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 6: Commit**

```bash
git add convex/plays convex/schema.ts
git commit -m "feat(plays): store practice plays, capped per draw and pruned per user"
```

---

### Task 3: Practice play payload shaper

**Files:**
- Create: `src/lib/profile/record.ts`
- Test: `src/lib/profile/record.test.ts`

**Interfaces:**
- Consumes: `TICKET_DETAIL_LIMIT` from `convex/plays/d.ts` (Task 2 — the server owns the cap, the client honours it); `Ticket`, `Draw`, `GameMode` from `src/lib/lotto.ts`; `GameId` from `src/lib/games.ts`
- Produces:
  - `interface PracticePlayInput { game: GameId; mode: GameMode; isOfficial: boolean; drawnBalls: number[]; seed: { clientSeed: string; serverSeed: string; nonce: number; rolls: number } | null; ticketCount: number; spent: number; won: number; winCount: number; bestHits: number; tickets: PracticeTicketDetail[]; drawnAt: number }`
  - `interface PracticeTicketDetail { numbers: number[]; betType: BetType; cost: BetCost; hits: number; prize: number; playerName: string | null }`
  - `type PracticePlayRow = PracticePlayInput & { _id: string; _creationTime: number }` — what `plays.q.mine` returns, declared here so the reader and the writer share one shape
  - `buildPracticePlay(args: { draw: Draw; mode: GameMode; settled: readonly { ticket: Ticket; playerName?: string }[] }): PracticePlayInput | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/profile/record.test.ts
describe('buildPracticePlay', () => {
  test('aggregates every settled ticket and caps the detail list at 50', () => {
    // 500 settled tickets, each cost 25, every 10th a 1000 prize
    assert.equal(play.ticketCount, 500)
    assert.equal(play.spent, 12_500)
    assert.equal(play.won, 50_000)
    assert.equal(play.winCount, 50)
    assert.equal(play.tickets.length, TICKET_DETAIL_LIMIT)
  })
  test('ranks detail by prize, then by hits', () => {
    assert.deepEqual(play.tickets.map(t => t.prize).slice(0, 3), [5000, 1000, 0])
    assert.equal(play.tickets[2].hits, 4) // the best of the prizeless
  })
  test('returns null for a draw with no settled tickets', () => {
    assert.equal(buildPracticePlay({ draw, mode: 'solo', settled: [] }), null)
  })
  test('ignores tickets for another game and tickets already settled', () => {
    // settled holds one '6/42' pending ticket, one '6/45' ticket, one status:'won' ticket
    assert.equal(play.ticketCount, 1)
    assert.equal(play.spent, 25)
  })
  test('carries the seed, mode and official flag through', () => {
    assert.equal(play.isOfficial, true)
    assert.equal(play.seed, null) // an official draw has no generator seed
    assert.equal(play.mode, 'party')
    assert.equal(play.tickets[0].playerName, 'Kim')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/profile/record.test.ts`
Expected: FAIL — cannot find module `./record`

- [ ] **Step 3: Implement `buildPracticePlay` in `src/lib/profile/record.ts`**

Filter to tickets whose `game` equals `draw.game` and whose `status` is `'pending'` at entry (the caller passes what it evaluated). Aggregate over all of them; `bestHits` is the maximum `hits`, `0` when there are none. Sort a copy by `prize` descending then `hits` descending before slicing to `TICKET_DETAIL_LIMIT` — never sort the caller's array. Return `null` when nothing survives the filter. `drawnAt` is `Date.now()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/profile/record.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/record.ts src/lib/profile/record.test.ts
git commit -m "feat(profile): shape a resolved draw into a capped practice play"
```

---

### Task 4: Practice statistics

**Files:**
- Create: `src/lib/profile/stats.ts`
- Test: `src/lib/profile/stats.test.ts`

**Interfaces:**
- Consumes: `PracticePlayRow` from `src/lib/profile/record.ts` (Task 3)
- Produces: `interface PracticeStats { plays: number; spent: number; won: number; net: number; winRate: number; bestDraw: PracticePlayRow | null; favouriteGame: GameId | null; hitDistribution: Segment[]; officialPlays: number; simulatedPlays: number }`, `readPracticeStats(rows: readonly PracticePlayRow[]): PracticeStats`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/profile/stats.test.ts
describe('readPracticeStats', () => {
  test('reads zeroes, not NaN, from no rows', () => {
    assert.deepEqual(stats.plays === 0 && stats.winRate === 0 && stats.net === 0, true)
    assert.equal(stats.bestDraw, null)
    assert.equal(stats.favouriteGame, null)
  })
  test('totals spend, winnings and net across rows', () => {
    assert.equal(stats.spent, 300); assert.equal(stats.won, 1200); assert.equal(stats.net, 900)
  })
  test('win rate is winning tickets over tickets played', () => {
    assert.equal(stats.winRate, 0.25) // 2 wins of 8 tickets
  })
  test('counts official and simulated plays apart', () => {
    assert.equal(stats.officialPlays, 1); assert.equal(stats.simulatedPlays, 2)
  })
  test('hit distribution sums to the tickets it describes', () => {
    assert.equal(sum(stats.hitDistribution.map(s => s.value)), 8)
  })
  test('names the best draw and the most played game', () => {
    assert.equal(stats.bestDraw?.won, 1000)
    assert.equal(stats.favouriteGame, '6/45')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/profile/stats.test.ts`
Expected: FAIL — cannot find module `./stats`

- [ ] **Step 3: Implement `readPracticeStats` in `src/lib/profile/stats.ts`**

Reuse `sum`, `ratio`, `countBy` and `toSegments` from `src/lib/overview/metrics.ts` rather than open-coding them; `ratio` already returns `0` for a zero denominator, which is what keeps an empty roster from producing `NaN`. The hit distribution is built from the capped `tickets` detail, so caption it as such on the page; `winRate` uses the `winCount`/`ticketCount` aggregates, which cover every ticket.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/profile/stats.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/stats.ts src/lib/profile/stats.test.ts
git commit -m "feat(profile): read practice statistics from stored plays"
```

---

### Task 5: The signed-in user's own wallet reads

**Files:**
- Modify: `convex/ledger/q.ts`
- Test: `convex/ledger/my-reads.test.ts`

**Interfaces:**
- Consumes: `getUserByTokenIdentifier` (`convex/users/q.ts`), `post` and the wallet helpers already used by `convex/ledger/api.test.ts` for fixtures
- Produces:
  - `api.ledger.q.myWallet` — args `{}`; returns `v.union(schema.doc('wallets'), v.null())`
  - `api.ledger.q.myLedgerHistory` — args `{ limit: v.optional(v.number()) }`; returns an array of `{ _id, amount, balanceAfter, bucket, createdAt, kind, memo }`, the same shape `partnerFloatHistory` returns

- [ ] **Step 1: Write the failing test**

```ts
// convex/ledger/my-reads.test.ts
test('myWallet is null when signed out and null before a wallet exists', ...)
test('myWallet returns the caller\'s own user wallet once allocated', ...)
test('myWallet never returns another user\'s wallet', ...)   // ben gets his own or null, never ana's
test('myLedgerHistory is empty when signed out or without a wallet', ...)
test('myLedgerHistory returns the caller\'s entries newest first with kind and memo', ...)
test('myLedgerHistory clamps limit and caps at the history limit', ...)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/ledger/my-reads.test.ts`
Expected: FAIL — `api.ledger.q.myWallet` does not exist

- [ ] **Step 3: Implement both queries in `convex/ledger/q.ts`**

`myWallet` reads the `wallets.by_userId` index for the caller's `users._id`, returning `null` for no identity, no user row or no wallet. `myLedgerHistory` finds that wallet, then reuses `partnerFloatHistory`'s exact approach: take the newest entries on `by_walletId_and_createdAt`, then join each to its transaction's `kind` and `memo` through a `Map` keyed by `txnId` so one transaction costs one `get`. Clamp `limit` to a `MY_HISTORY_LIMIT` of 20. Neither query takes an id from the caller, so there is nothing to probe.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/ledger/my-reads.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add convex/ledger/q.ts convex/ledger/my-reads.test.ts
git commit -m "feat(ledger): let a user read their own wallet and its history"
```

---

### Task 6: Live Convex subscription hook

**Files:**
- Create: `src/hooks/use-convex-query.ts`, `src/hooks/subscription-key.ts`
- Test: `src/hooks/subscription-key.test.ts`

**Interfaces:**
- Consumes: `convexClient`, `getConvexAuthState`, `subscribeToConvexAuthState` from `src/lib/convex-client.ts`
- Produces: `toSubscriptionKey(args: Record<string, unknown>): string`, `useConvexQuery<T>(reference, args, options?: { enabled?: boolean }): T | undefined`

There is no component test infrastructure in this repo, so the hook's own behaviour is proven in Task 8's browser check. The part that can go wrong silently — re-subscribing on an args change — is a pure function and is tested here.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/subscription-key.test.ts
test('two argument objects differing only in key order share a key', ...)
test('a changed value changes the key', ...)
test('an empty object has a stable key', ...)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hooks/subscription-key.test.ts`
Expected: FAIL — cannot find module `./subscription-key`

- [ ] **Step 3: Implement `toSubscriptionKey` in `src/hooks/subscription-key.ts`**

Serialize with sorted keys, so `{a:1,b:2}` and `{b:2,a:1}` do not cause a needless re-subscribe.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/hooks/subscription-key.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Implement `useConvexQuery` in `src/hooks/use-convex-query.ts`**

`useState` for the value plus a `useEffect` keyed on the query reference and `toSubscriptionKey(args)`. The effect returns `undefined` immediately and subscribes only when `convexClient` exists, `getConvexAuthState().isAuthenticated` is true, and `options.enabled` is not `false`; it calls `convexClient.onUpdate(reference, args, setValue)` and returns its unsubscribe function from the cleanup. Subscribe to auth state with `useSyncExternalStore` over `subscribeToConvexAuthState`/`getConvexAuthState` so signing in or out re-runs the effect; clear the value on sign-out so a stale balance never outlives the session.

- [ ] **Step 6: Verify it typechecks**

Run: `bun run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-convex-query.ts src/hooks/subscription-key.ts src/hooks/subscription-key.test.ts
git commit -m "feat(hooks): subscribe to a Convex query for live reads"
```

---

### Task 7: The `/me` page and its route

**Files:**
- Create: `src/pages/profile-page.btsx`
- Modify: `src/lib/analytics-router.ts`, `src/App.btsx:581`, `src/components/AccountSwitcher.btsx`

**Interfaces:**
- Consumes: `isAppPagePath` (Task 1), `readPracticeStats` (Task 4), `api.plays.q.mine` (Task 2), `api.ledger.q.myWallet` and `api.ledger.q.myLedgerHistory` (Task 5), `useConvexQuery` (Task 6), `api.users.q.current` (exists), `useFirebaseUser` and `signInWithGoogle` (`src/lib/firebase/auth.ts`)
- Produces: the `/me` route; nothing later depends on it

- [ ] **Step 1: Build the page in `src/pages/profile-page.btsx`**

Follow `src/pages/asgard-overview-page.btsx` for structure: a `module` block for constants, `setup` for data, then the template. Reuse `Masthead`, `Panel`, `StatTile`, `Distribution` from `@/components/overview` and `formatPeso`/`formatCompactPeso` from `@/lib/format`, `formatRelativeTime`/`formatCount`/`formatPercent` from `@/lib/overview/metrics`.

Five panels in the spec's order — Identity, Credits, Practice, Recent plays, Real plays (empty state). Signed out, all five are replaced by a single sign-in prompt calling `signInWithGoogle`. Where Firebase or Convex is unconfigured, identity still renders from `useFirebaseUser` alone and the data panels read as empty — the app already degrades this way, and `isFirebaseConfigured` is the flag `AccountSwitcher` uses for it. A signed-in user whose `users` row has not been written yet (`ensureCurrent` is in flight) sees empty panels, not an error. A missing wallet renders a `0` balance, not an error; each panel renders empty on its own rather than failing the page. Exactly one `hero` StatTile, per that component's contract.

- [ ] **Step 2: Add the route and the shell wiring**

In `src/lib/analytics-router.ts`, add a `/me` route to `createAppRouteTree()` with `lazyRouteComponent(() => import('../pages/profile-page.btsx'))`, matching how the asgard pages are loaded. In `src/App.btsx:581`, replace `pathname !== "/analytics"` with `!isAppPagePath(pathname)`. In `AccountSwitcher.btsx`, add a `Profile` action for any signed-in user, beside the existing Asgard entry, navigating to `/me` via the `navigate` helper it already imports.

- [ ] **Step 3: Verify the build and types**

Run: `bun run typecheck && bun run build`
Expected: both succeed

- [ ] **Step 4: Verify the page in the browser**

Run `bun run dev` with `npx convex dev` alongside. Open `/me` signed out: the sign-in prompt shows and the game grid is gone. Sign in: the identity panel fills, credits read `0` with no wallet, and the practice and real-plays panels show their empty states. Confirm the console is free of errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/profile-page.btsx src/lib/analytics-router.ts src/App.btsx src/components/AccountSwitcher.btsx
git commit -m "feat(profile): add the /me dashboard route"
```

---

### Task 8: Record a resolved draw

**Files:**
- Modify: `src/App.btsx` (end of `evaluateTickets`, around line 376-456)

**Interfaces:**
- Consumes: `buildPracticePlay` (Task 3), `api.plays.m.record` (Task 2), `convexClient` (`src/lib/convex-client.ts`), `auth` (`src/lib/firebase`)
- Produces: nothing; this is the write path

- [ ] **Step 1: Add the write at the end of `evaluateTickets`**

After the existing state updates and before `setIsDrawing(false)`, collect what was settled this draw — in solo, the tickets just evaluated; in party, each evaluated ticket with its player's `name` — and pass them with the `draw`, `mode` and `isOfficialDraw` to `buildPracticePlay`. When it returns a play and `convexClient` exists and `auth?.currentUser` is set, `void convexClient.mutation(api.plays.m.record, play).catch(...)` with a `console.error`. Nothing is awaited and nothing is shown to the player.

- [ ] **Step 2: Verify the types and the existing suite**

Run: `bun run typecheck && bun run test`
Expected: typecheck clean; every test passes

- [ ] **Step 3: Verify end to end in the browser**

With `bun run dev` and `npx convex dev`: sign in, buy a few tickets, run a draw, and watch `/me` in a second tab fill **without a reload** — the live subscription is the point of the design. Confirm the draw animation and win sequence are unchanged, then run a draw signed out and confirm no row is written and no error appears.

- [ ] **Step 4: Commit**

```bash
git add src/App.btsx
git commit -m "feat(profile): record each resolved draw as a practice play"
```

---

## Done when

`bun run check` passes (typecheck + build), `bun run test` passes, and in the browser a signed-in user can run a draw and watch `/me` update live: identity, a credit balance, practice statistics, their recent plays, and a real-plays panel waiting on the ticket phase.
