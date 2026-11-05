# House Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the linked primary contact of a `pending` account confirm it, moving it to `confirmed` so the banker picker offers it.

**Architecture:** A dedicated Convex mutation behind a new narrow guard that keys on `primaryContact.tokenIdentifier` and `status === 'pending'`. A second player-facing query lists the caller's own houses for a card on `/me`. Card logic lives in a pure `src/lib` module; the component stays thin.

**Tech Stack:** Convex (queries, mutations, `convex-test`), Octane `.btsx`, Tailwind v4, vitest + `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-05-house-confirmation-design.md`

## Global Constraints

- **The guard keys on `primaryContact.tokenIdentifier`, never on email.** Being *named* as a contact is not proof of being one; `linkAccountsToUser` is what turns a name into a credential. An email-keyed guard would let anyone who can receive mail at a named address confirm themselves into running a house.
- Player-facing queries declare an explicit narrow `returns` validator. Never `accountDocumentSchema`.
- New account fields are `v.optional(...)`, so no backfill migration runs. This differs from `closedAt`/`closedBy` deliberately — the spec explains why.
- **`convex/tsconfig.json` has no `paths` mapping**, and `convex/accounts/{d,q,m,helpers}.ts` all import `src/lib/accounts/accounts.ts` by relative path. Anything reachable from `convex/` must therefore use relative imports, and must never import the `src/lib/icons` **barrel** — it re-exports `icon.btsx`, which Convex's `tsc` cannot resolve (fixed in `f705041`; do not reintroduce).
- This repo has **no `.btsx` test harness** — every test is a pure `.ts` module. `bun run typecheck:ts` does not cover `.btsx` either.
- Convex error style: `throw new ConvexError('Sentence with a full stop.')`. The message is shown to users as is.
- `bun run typecheck` (without `:ts`) crashes in `@tsrx/typescript-plugin` on a clean tree — pre-existing. Use `bun run typecheck:ts`, and also `npx tsc -p convex/tsconfig.json --noEmit`.
- Tests: `bun run test` (= `bun test src && vitest run`).
- Out of scope: declining, payout details, terms, anything outbound, and the notification service.

## Review Focus

1. **Double confirm.** A second `confirmAsContact` on the same account (double click, stale tab) must refuse cleanly rather than rewriting `confirmedAt`. — Task 2
2. **Named but never linked.** An account whose `primaryContact.tokenIdentifier` is still `null`, where the caller's verified email happens to match it, must be refused. — Task 2
3. **Several houses at mixed statuses.** A contact for three houses — pending, confirmed, suspended — sees all three, with a confirm action on only the pending one. — Task 4
4. **A contact for nothing.** A signed-in player who is nobody's contact gets no card at all, not an empty one. — Task 4
5. **Pre-existing rows have no `confirmedAt`.** The field is optional in storage but `v.union(v.number(), v.null())` in the query's validator, so the handler must map missing to `null` or Convex rejects the response. — Task 3

---

### Task 1: Move the status records out of the asgard namespace

**Files:**
- Create: `src/lib/accounts/account-status.ts`
- Modify: `src/lib/asgard/accounts.ts:102-132` (remove three records, import the label one back)
- Modify: `src/components/asgard/accounts-panel.btsx`, `src/components/asgard/status-badge.btsx`, `src/components/topbar/BankerSwitcher.btsx` (import sites only)

**Interfaces:**
- Produces: `ACCOUNT_STATUS_LABEL`, `ACCOUNT_STATUS_ICON`, `ACCOUNT_STATUS_TONE` from `src/lib/accounts/account-status.ts`, same types and same values as today.

**Deviation from the spec, deliberate:** the spec said move them into `src/lib/accounts/accounts.ts`. Do **not**. That file is imported by four Convex modules, and `ACCOUNT_STATUS_ICON` needs `IconName` — which would drag an icons import into Convex's typecheck graph and risk exactly the TS2307 that `f705041` fixed. A sibling module nothing in `convex/` imports removes the hazard instead of navigating it. `account-status.ts` imports `AccountStatus` from `./accounts` and `IconName` from `../icons/icons` (the module, not the barrel).

`ACCOUNT_STATUS_FILTERS` and `ACCOUNT_STATUS_FILTER_LABEL` are console concepts and **stay** in `src/lib/asgard/accounts.ts`, importing `ACCOUNT_STATUS_LABEL` from its new home.

- [ ] **Step 1: Create `src/lib/accounts/account-status.ts`** with the three records moved verbatim — same keys, same strings, same Tailwind classes. No values change in this task.

- [ ] **Step 2: Update `src/lib/asgard/accounts.ts`** — delete the three records and import `ACCOUNT_STATUS_LABEL` from `@/lib/accounts/account-status`, which `ACCOUNT_STATUS_FILTER_LABEL` spreads. Do **not** re-export the three from here: a re-export leaves the asgard module as a route to them and the boundary stays exactly as blurred as it is today.

- [ ] **Step 3: Update the three consumer import sites** to the new module.

- [ ] **Step 4: Verify nothing changed**

Run: `bun run typecheck:ts` → exit 0
Run: `npx tsc -p convex/tsconfig.json --noEmit` → exit 0 (this is the one that catches the icons hazard)
Run: `bun run test` → green
Then `grep -rn "ACCOUNT_STATUS_\(LABEL\|ICON\|TONE\)" src | grep asgard` should return nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounts/account-status.ts src/lib/asgard/accounts.ts src/components/asgard src/components/topbar/BankerSwitcher.btsx
git commit -m "refactor:accounts(status) move the status records out of the asgard namespace"
```

---

### Task 2: Confirmation fields, guard and mutation

**Files:**
- Modify: `convex/accounts/d.ts` (two fields on `accountSchema`)
- Modify: `convex/accounts/helpers.ts` (new guard, beside `requireAccountManager`)
- Modify: `convex/accounts/m.ts` (new mutation)
- Test: `convex/accounts/confirmation.test.ts` (new; `accounts.test.ts` is already long)

**Interfaces:**
- Consumes: `canUseAccount` is **not** used here — see below.
- Produces: `requirePendingAccountContact(ctx, accountId) => { identity, account }`, and `api.accounts.m.confirmAsContact({ accountId: Id<'accounts'> }) => null`. The account document gains `confirmedAt?: number` and `confirmedBy?: string`.

`requirePendingAccountContact` cannot reuse `requireAccountManager`: that guard requires `canUseAccount(status)`, which a *pending* account's own contact fails by definition. That is the whole reason this task exists.

- [ ] **Step 1: Write the failing tests** in `convex/accounts/confirmation.test.ts`, following `convex/accounts/accounts.test.ts` for `convexTest(schema, modules)`, `t.withIdentity(...)` and the identities in `convex/lib/testIdentities.ts`. Link a contact by calling `api.users.m.ensureCurrent` as that identity — it runs `linkAccountsToUser` (`convex/users/m.ts:52`) — rather than patching `tokenIdentifier` by hand, so the tests exercise the real linking path. Account status fixtures still patch directly via `t.run((ctx) => ctx.db.patch(accountId, { status }))`, as the banker plan established.

```ts
test('the linked contact confirms a pending house')            // status 'confirmed', confirmedAt a number, confirmedBy their tokenIdentifier
test('a second confirm is refused and does not rewrite confirmedAt')  // Review Focus 1
test('a named but unlinked contact is refused even with a matching verified email')  // Review Focus 2
test('a signed-in user who is not the contact is refused, and nothing is stored')
test('an unauthenticated caller is refused')
test('confirming is refused for confirmed, active, suspended and closed')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/accounts/confirmation.test.ts`
Expected: FAIL — `api.accounts.m.confirmAsContact` is not a function.

- [ ] **Step 3: Add the fields** — `confirmedAt: v.optional(v.number())` and `confirmedBy: v.optional(v.string())` on `accountSchema` in `convex/accounts/d.ts`, each with a one-line comment in the file's existing style. Optional, so no migration.

- [ ] **Step 4: Implement the guard** in `convex/accounts/helpers.ts`:

```ts
export const requirePendingAccountContact = async (ctx: QueryCtx | MutationCtx, accountId: Id<'accounts'>) => { /* … */ }
```

Require an identity; load the account; refuse unless `account.primaryContact.tokenIdentifier === identity.tokenIdentifier` **and** `account.status === 'pending'`. One `throw new ConvexError('Unauthorized.')` covers every failure, matching `requireAccountManager`'s comment about not telling the caller which condition they failed. Return `{ identity, account }`.

- [ ] **Step 5: Implement the mutation** in `convex/accounts/m.ts`:

```ts
export const confirmAsContact = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, { accountId }) => { /* … */ }
})
```

Guard, then patch `status: 'confirmed'`, `confirmedAt: Date.now()`, `confirmedBy: identity.tokenIdentifier`, `updatedAt`, `updatedBy`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run convex/accounts/confirmation.test.ts` → PASS
Run: `bun run test` → green

- [ ] **Step 7: Commit**

```bash
git add convex/accounts/d.ts convex/accounts/helpers.ts convex/accounts/m.ts convex/accounts/confirmation.test.ts
git commit -m "feat:accounts(confirmAsContact) the linked contact accepts their house"
```

---

### Task 3: `accounts.q.myHouses`

**Files:**
- Modify: `convex/accounts/q.ts`
- Test: `convex/accounts/confirmation.test.ts` (extend Task 2's file — same feature, same fixtures)

**Interfaces:**
- Consumes: the `confirmedAt` field from Task 2; the existing `by_primaryContact_tokenIdentifier` index.
- Produces: `api.accounts.q.myHouses` with args `{}`.

- [ ] **Step 1: Write the failing tests**

```ts
test('myHouses returns exactly the five permitted keys')   // ['accountId','confirmedAt','name','slug','status']
test('myHouses returns only the callers own accounts')     // a second contact's house never appears
test('myHouses reports confirmedAt as null when unset')    // Review Focus 5
test('myHouses refuses an unauthenticated caller')
test('after confirmAsContact the house appears in listBankers as confirmed')  // the reactive outcome, asserted
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/accounts/confirmation.test.ts`
Expected: FAIL — `api.accounts.q.myHouses` is not a function.

- [ ] **Step 3: Implement the query** in `convex/accounts/q.ts`:

```ts
export const myHouses = query({
  args: {},
  returns: v.array(v.object({
    accountId: v.id('accounts'),
    slug: v.string(),
    name: v.string(),
    status: accountStatusSchema,
    confirmedAt: v.union(v.number(), v.null())
  })),
  handler: async (ctx) => { /* … */ }
})
```

Require `ctx.auth.getUserIdentity()`, throwing `ConvexError('Unauthorized.')` when absent. Read `by_primaryContact_tokenIdentifier` for that identity, capped at `MAX_LIST_LIMIT`. Project the five fields, mapping an absent `confirmedAt` to `null`. **No `users` row is needed** — unlike `listBankers`, this matches on the identity's token directly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/accounts/confirmation.test.ts` → PASS
Run: `bun run test` → green

- [ ] **Step 5: Commit**

```bash
git add convex/accounts/q.ts convex/accounts/confirmation.test.ts
git commit -m "feat:accounts(myHouses) the caller's own houses, behind a narrow validator"
```

---

### Task 4: Pure module for the card

**Files:**
- Create: `src/lib/accounts/my-houses.ts`
- Test: `src/lib/accounts/my-houses.test.ts`

**Interfaces:**
- Consumes: `AccountStatus` and `canUseAccount` from `./accounts`; `ACCOUNT_STATUS_LABEL` from `./account-status` (Task 1).
- Produces:

```ts
export interface MyHouseRow {
  accountId: string
  slug: string
  name: string
  status: AccountStatus
  confirmedAt: number | null
}

export interface MyHouseItem {
  id: string
  name: string
  status: AccountStatus
  detail: string          // the muted second line
  canConfirm: boolean
}

export function toMyHouseItems(rows: MyHouseRow[]): MyHouseItem[]
```

Ordering: houses awaiting confirmation first, then the rest, alphabetically by name within each group, with `slug` breaking a name tie — the same determinism rule `compareBankerRows` uses.

`detail` is `'Waiting for you to confirm'` when `status === 'pending'`, otherwise `ACCOUNT_STATUS_LABEL[status]`. `canConfirm` is `status === 'pending'` and nothing else — a house is confirmable exactly when the server's guard would allow it.

- [ ] **Step 1: Write the failing tests** in `src/lib/accounts/my-houses.test.ts`, matching the style of `src/lib/accounts/bankers.test.ts`.

```ts
test('toMyHouseItems marks only pending rows confirmable')
test('toMyHouseItems labels a pending row "Waiting for you to confirm"')
test('toMyHouseItems labels non-pending rows with their status label')
test('toMyHouseItems puts pending houses first, then alphabetical within each group')
test('toMyHouseItems breaks a name tie by slug')
test('toMyHouseItems returns an empty array for no rows')     // Review Focus 4
test('toMyHouseItems handles mixed statuses in one list')     // Review Focus 3 — pending, confirmed, suspended together
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/lib/accounts/my-houses.test.ts`
Expected: FAIL — cannot resolve `./my-houses`.

- [ ] **Step 3: Implement the three exports** in `src/lib/accounts/my-houses.ts`. Sort a copy rather than mutating the input, as `toBankerItems` does.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/accounts/my-houses.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounts/my-houses.ts src/lib/accounts/my-houses.test.ts
git commit -m "feat:accounts(my-houses) card rows for the houses you contact"
```

---

### Task 5: The "Your houses" card on `/me`

**Files:**
- Modify: `src/pages/profile-page.btsx`

**Interfaces:**
- Consumes: Task 3's `api.accounts.q.myHouses`, Task 2's `api.accounts.m.confirmAsContact`, Task 4's `toMyHouseItems` and `MyHouseItem`.

- [ ] **Step 1: Add the card.** Use the existing `Panel` from `@/components/overview`, as the page's other sections do (`title='Your houses'`). Subscribe with `useConvexQuery(api.accounts.q.myHouses, {}, { enabled: isSignedIn })`, following the page's existing subscriptions at lines 110-113.

Three states, and the distinction matters: `undefined` means **no answer yet** and must never render as "you have no houses" — the hook's own documentation is emphatic about this and `BankerSwitcher` already honours it. An empty **array** means the caller contacts no houses, and the whole `Panel` is then **absent** rather than empty, because most players are not house contacts.

Each row renders `name`, the muted `detail`, and — when `canConfirm` — a button that calls `confirmAsContact`. Surface a rejection through whatever the page already uses for errors; if it has no such channel, the button's own disabled/`aria-busy` state is enough, and say so in the report rather than inventing a toast system.

- [ ] **Step 2: Verify types**

Run: `bun run typecheck:ts` → exit 0
Run: `npx tsc -p convex/tsconfig.json --noEmit` → exit 0

- [ ] **Step 3: Verify in the browser** — `preview_start` the `lucky-pick` config and open `/me`. Signed out, the page behaves as before. The signed-in path needs Convex and Firebase: if the workspace has no `.dev.vars`, that is **not** something to work around — do not copy secrets, do not stub auth. Report exactly which states you saw and which you could not.

- [ ] **Step 4: Commit**

```bash
git add src/pages/profile-page.btsx
git commit -m "feat:profile(houses) confirm the house you were named on"
```

---

## Done when

`bun run test`, `bun run typecheck:ts` and `npx tsc -p convex/tsconfig.json --noEmit` all pass, and a signed-in contact of a pending house can confirm it from `/me` and then select it in the topbar picker without reloading.
