# Banker/House select: a player-safe roster and a durable choice

## Context

Asgard creates accounts. Players cannot see them. The only roster that exists —
`accounts.q.listForAsgard` — is guarded by `requireStaffIdentity`, reached through
an HTTP route that additionally demands a verified god session cookie *and* an
asgard hostname, and declares `returns: v.array(accountDocumentSchema)`: the whole
document, payout bank details, contact phone numbers, notes and
`ownerTokenIdentifier` included. There is no read of the `accounts` table a player
is allowed to make.

Meanwhile the account-scoped money system is already built and already indexed for
exactly this: `credits.by_accountId_and_userId`, `wallets.by_accountId_and_userId`,
`ledgerTransactions.by_accountId_and_createdAt`. A user can hold credits *at a
house* today. Nothing in the app has ever let them choose one.

Asked for: a Banker/House select option, listing the accounts created in asgard,
with pending accounts visible but disabled.

Decisions made in brainstorming:

| Topic | Decision |
|---|---|
| What picking does | **The house is the counterparty** the player's stakes and winnings settle with — which is why the choice must be server-readable |
| Scope of this spec | **Roster and selection only.** Settlement is its own spec (see below) |
| Auth | **Sign-in required to pick.** No signed-out selection to migrate later |
| Selectable | **`canUseAccount(status)`** — `confirmed` or `active`. The predicate already exists in `src/lib/accounts/accounts.ts`; this spec does not invent a second rule |
| Shown but disabled | **`pending`** ("Not yet open") and **`suspended`** ("Temporarily off") |
| Hidden | **`closed`.** A finished house is noise, and listing it leaks that it existed |
| Where it lives | **Topbar switcher**, beside `AccountSwitcher`, on every screen while signed in |
| Where the choice is stored | **`selectedAccountId` on the `users` row**, written through a mutation that re-checks the status server-side |
| Roster read path | **A new Convex query, called directly from the browser.** No worker route |

### Why settlement is deferred

Making a house the real counterparty means debiting a stake and crediting a prize
through `ledgerTransactions`, with idempotency, insufficient-funds behaviour, and a
draw the server is willing to stand behind. The draw is currently computed in the
browser: `practicePlays.seed` is a client-side `DrawSeed` and its own schema
comment calls `drawnAt` *"the client's clock"*, while the row as a whole is
described as *"history, not money"*.

The profile-dashboard spec (`2026-11-02`) already drew this line for the same
reason — *"a client-drawn ball must never pay a real prize"* — and deferred real
plays to the money engine's ticket phase. This spec takes the same position and
adds nothing to the ledger. `convex/ledger/d.ts` already reserves `ticketHold`,
`ticketCapture` and `prize`; none of them is written here.

What this spec does guarantee is that settlement will not have to redo the
selection: the chosen house lives on the `users` row, where a server-side
mutation can read it.

### Out of scope

Ledger writes of any kind; stakes, prizes, holds or captures; any change to
`practicePlays` or to how a draw is computed; creating, editing or suspending a
house (asgard keeps all of that); showing a house's own figures to players beyond
their personal balance; any signed-out view of the roster.

Status: design approved 2026-11-05. Implementation plan (writing-plans) comes next,
before any code.

---

## Architecture

```
  Asgard (unchanged)                    Player (new)
  ──────────────────                    ────────────
  accounts.q.listForAsgard              accounts.q.listBankers
    requireStaffIdentity                  any authenticated identity
    returns accountDocumentSchema         returns an explicit 5-field object
    via /api/asgard/accounts              via convexClient.onUpdate
    (god cookie + asgard host)            (Firebase identity)
         │                                     │
         ▼                                     ▼
    ┌─────────────────────────────────────────────────┐
    │                accounts table                   │
    └─────────────────────────────────────────────────┘
                                               │ join on caller's own rows
                                               ▼
                                         credits table

  users.selectedAccountId  ◀── users.m.selectBanker (re-checks canUseAccount)
         │
         ▼
  BankerSwitcher (topbar) ── resolves the id against the roster it already has
```

Two queries read the same table under two different contracts. That is the whole
security design: the boundary is a *separate function with a separate return
validator*, not a parameter or a flag on the existing one.

---

## Data

### Schema change

One optional field on `users` (`convex/users/v.ts`):

```ts
selectedAccountId: v.optional(v.id('accounts'))
```

Optional, so every existing row stays valid and no migration runs. The id alone,
with no denormalized slug or name: the picker is already subscribed to the roster
and can resolve it. `users.q.current` returns `schema.doc('users')`, so the field
reaches the client with no change to that query.

### `accounts.q.listBankers`

New query in `convex/accounts/q.ts`.

- **Args:** none.
- **Guard:** `ctx.auth.getUserIdentity()`; throw if absent. Deliberately *not*
  `requireStaffIdentity` — this is the one account read a player may make. The
  caller's `users` row is then loaded via the existing `getUserByTokenIdentifier`,
  because `balance` needs their `_id`; a signed-in identity with no row yet reads
  as every balance `0` rather than as an error.
- **Returns**, written out in full rather than reusing `accountDocumentSchema`:

```ts
v.array(v.object({
  accountId: v.id('accounts'),
  slug:      v.string(),
  name:      v.string(),
  status:    accountStatusSchema,
  balance:   v.number()
}))
```

**This validator is the security boundary.** Convex enforces it at runtime, so a
field added to `accounts` in a year's time cannot start reaching players by
inheritance. Reusing the asgard document schema would make the full document the
contract, and the leak would be silent.

- **Which rows:** four indexed reads on `by_status_and_createdAt`, one each for
  `pending`, `confirmed`, `active`, `suspended`. Closed rows are never read, rather
  than read and then filtered out.
- **`balance`:** the caller's own credits, via the existing
  `listCreditsForUser(ctx, userId)`, mapped `accountId → balance` and defaulted to
  `0`. Never another user's.
- **Order:** usable houses (`canUseAccount`) first, alphabetically by name; then
  unusable ones, alphabetically. Deterministic, and the thing a player can act on
  is at the top.

### `users.m.selectBanker`

New mutation in `convex/users/m.ts`. Args: `{ accountId: v.union(v.id('accounts'), v.null()) }`.

`null` clears the selection. Otherwise: require identity, load the user row, load
the account, throw if it does not exist, throw if `canUseAccount(account.status)`
is false, then patch `selectedAccountId` and `updatedAt`.

The greyed-out rows in the UI are a courtesy. This check is the rule.

---

## UI

### `switcher.btsx`

`SwitcherItem` gains two optional fields:

```ts
disabled?: boolean
meta?: string      // right-aligned qualifier, as SwitcherAction already has
```

and the hardcoded item guard becomes:

```ts
disabled={item.disabled === true || item.id === activeItem?.id}
```

Both changes are additive. `AccountSwitcher`, the only current consumer, is
untouched and unaffected.

### `BankerSwitcher.btsx`

New component in `src/components/topbar/`, modelled on `AccountSwitcher`:
subscribes with `useConvexQuery(api.accounts.q.listBankers, {}, { enabled: user !== null })`,
maps rows to `SwitcherItem`s, and calls `selectBanker` on select.

| Row state | Rendering |
|---|---|
| `confirmed` / `active` | Selectable. `meta` shows the player's balance at that house, via the existing `formatAccountCredits` |
| `pending` | `disabled`, description "Not yet open" |
| `suspended` | `disabled`, description "Temporarily off" |
| `closed` | Absent — never returned by the query |

Mounted in `AppHeader.btsx` beside `AccountSwitcher`.

**Signed out, the component does not render.** The query requires auth, so there
would be nothing to show, and `AccountSwitcher` already sits beside it as the way
in. This is a deliberate trade and a known cost: with the hero shopfront not being
built, a logged-out visitor learns nothing about houses. Reversing it means giving
the trigger a signed-out label and routing its one action to sign-in; nothing in
this design depends on the current choice.

---

## States and failures

`useConvexQuery` returns `undefined` for *"no answer"* — loading, signed out, or a
first read that errored. The hook's own documentation insists this is not a fact to
render, and the picker must honour that: `undefined` shows the busy trigger, never
"no houses".

| Situation | Behaviour |
|---|---|
| Roster not yet delivered | Trigger shows `busy` |
| Roster delivered, empty | "No houses yet" |
| No selection | "Choose house" |
| Selected house `suspended` | Stays selected; chip takes a warning tone. The house changed, not the player's choice — and once credits are involved they need to see that |
| Selected house `closed` or deleted | Not in the roster, so the id does not resolve; falls back to "Choose house". A closed house has stopped being anyone's banker |
| House suspended between render and click | Mutation throws; surfaced through the existing `onNotify` toast |

---

## Testing

Runner: `bun test src && vitest run`, alongside `convex/accounts/accounts.test.ts`.

The test that matters most asserts the **exact key set** of a `listBankers` row, so
that adding a field to `accounts` fails this test rather than reaching players.

| Test | Asserts |
|---|---|
| Returned shape | Exactly `accountId`, `slug`, `name`, `status`, `balance`. No payout details, contacts, notes or `ownerTokenIdentifier` |
| Status filter | `closed` excluded; `pending` and `suspended` present |
| Guard | Unauthenticated call is refused |
| Balance isolation | Joins only the caller's `credits`; another user's balance at the same house never appears |
| Ordering | Usable houses precede unusable ones; alphabetical within each group |
| `selectBanker` refusals | `pending`, `suspended`, `closed`, and an id that does not exist |
| `selectBanker` success | Patches `selectedAccountId`; `null` clears it |

Pure helpers (ordering, the disabled-reason string) are unit-tested in `src/lib/`
rather than through Convex.
