# Banker/House Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in player choose which asgard-created house is their banker, with pending and suspended houses shown but unselectable.

**Architecture:** A new Convex query (`accounts.q.listBankers`) reads the `accounts` table under a player-level guard and an explicit narrow return validator, separate from the staff-only `listForAsgard`. The choice is stored as `selectedAccountId` on the `users` row through a mutation that re-checks status server-side. All picker logic lives in a pure `src/lib` module; the component renders it.

**Tech Stack:** Convex (queries, mutations, `convex-test`), Octane `.btsx` components, Tailwind v4, vitest + `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-05-banker-house-select-design.md`

## Global Constraints

- Selectable means `canUseAccount(status)` — `confirmed` or `active`. Import it from `src/lib/accounts/accounts.ts`; do not restate the rule.
- `listBankers` returns exactly `accountId`, `slug`, `name`, `status`, `balance`. Never reuse `accountDocumentSchema` for a player-facing return.
- Statuses returned: `pending`, `confirmed`, `active`, `suspended`. `closed` is never read.
- No ledger writes, no stakes, no prizes, no change to `practicePlays`.
- This repo has **no `.btsx` test harness**. Every testable unit goes in a `.ts` module under `src/lib/`; components stay thin and are verified in the browser preview.
- Tests run with `bun test src && vitest run` (`bun run test`). Convex tests are vitest; `src/lib` tests are `bun test`.
- Convex error style: `throw new ConvexError('Sentence with a full stop.')` — the message is shown to users as is.

## Review Focus

1. **Signed-in identity with no `users` row yet** (provisioning race): `listBankers` must return the roster with every balance `0`, not throw. — Task 3
2. **The account's unlinked opening `credits` row** (`userId: null`, created with the account) must never be counted as the caller's balance. — Task 3
3. **A selected house later suspended** must still resolve and render as the selection, flagged unusable — not vanish. — Task 2
4. **A selected house later closed or deleted** does not appear in the roster, so the id must resolve to `null` and read as "no selection" rather than crashing. — Task 2
5. **Two houses with the same name** must order deterministically rather than depending on read order. — Task 2

---

### Task 1: `selectedAccountId` and the `selectBanker` mutation

**Files:**
- Modify: `convex/users/v.ts` (add to `userFields`)
- Modify: `convex/users/m.ts` (new exported mutation)
- Test: `convex/users/users.test.ts`

**Interfaces:**
- Consumes: `canUseAccount` from `src/lib/accounts/accounts.ts`; `getUserByTokenIdentifier` from `convex/users/q.ts`.
- Produces: `users.m.selectBanker({ accountId: Id<'accounts'> | null }) => null`. The `users` document gains `selectedAccountId?: Id<'accounts'>`, which flows to the client through the existing `users.q.current`.

- [ ] **Step 1: Write the failing tests** in `convex/users/users.test.ts`, following the existing file's `convexTest(schema, modules)` + `t.withIdentity(...)` style and the `god` / `member` identities from `convex/lib/testIdentities.ts`.

```ts
test('selectBanker stores an active house', /* asserts users row selectedAccountId === accountId */)
test('selectBanker clears with null', /* set, then null, then expect undefined */)
test('selectBanker refuses a pending house', /* create account (status defaults to pending), expect rejects */)
test('selectBanker refuses a suspended house', /* expect rejects */)
test('selectBanker refuses an unknown account id', /* expect rejects */)
test('selectBanker refuses an unauthenticated caller', /* no withIdentity, expect rejects */)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/users/users.test.ts`
Expected: FAIL — `api.users.m.selectBanker` is not a function.

- [ ] **Step 3: Add the field** — `selectedAccountId: v.optional(v.id('accounts'))` to `userFields` in `convex/users/v.ts`. Optional, so no migration.

- [ ] **Step 4: Implement `selectBanker`** in `convex/users/m.ts`:

```ts
export const selectBanker = mutation({
  args: { accountId: v.union(v.id('accounts'), v.null()) },
  returns: v.null(),
  handler: async (ctx, { accountId }) => { /* … */ }
})
```

Require identity (`ConvexError('Unauthenticated.')`), load the caller's row via `getUserByTokenIdentifier`, throw if absent. For a non-null `accountId`: `ctx.db.get('accounts', accountId)`, throw `ConvexError('That house is no longer available.')` if missing, and throw `ConvexError('That house is not taking players right now.')` when `canUseAccount(account.status)` is false. Patch `selectedAccountId` (use `undefined` to clear) and `updatedAt`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run convex/users/users.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/users/v.ts convex/users/m.ts convex/users/users.test.ts
git commit -m "feat:users(selectBanker) store the player's chosen house"
```

---

### Task 2: Pure banker-roster module

**Files:**
- Create: `src/lib/accounts/bankers.ts`
- Test: `src/lib/accounts/bankers.test.ts`

**Interfaces:**
- Consumes: `AccountStatus`, `canUseAccount`, `formatAccountCredits` from `src/lib/accounts/accounts.ts`; `IconName` from `src/lib/icons`.
- Produces, all pure:

```ts
export interface BankerRow {
  accountId: string
  slug: string
  name: string
  status: AccountStatus
  balance: number
}

export interface BankerItem {
  id: string
  label: string
  icon: IconName
  description?: string
  meta?: string
  disabled?: boolean
}

export function compareBankerRows(a: BankerRow, b: BankerRow): number
export function describeBankerStatus(status: AccountStatus): string | null
export function toBankerItems(rows: BankerRow[]): BankerItem[]
export function resolveSelectedBanker(rows: BankerRow[], selectedAccountId: string | null | undefined): BankerRow | null
```

- [ ] **Step 1: Write the failing tests** in `src/lib/accounts/bankers.test.ts` (`bun test` style, matching `src/lib/profile/stats.test.ts`).

```ts
test('compareBankerRows puts usable houses before unusable ones')
test('compareBankerRows sorts alphabetically within a group')
test('compareBankerRows breaks a name tie by slug')          // Review Focus 5
test('describeBankerStatus returns null for confirmed and active')
test('describeBankerStatus maps pending and suspended', /* 'Not yet open', 'Temporarily off' */)
test('toBankerItems disables pending and suspended rows')
test('toBankerItems leaves confirmed and active rows enabled')
test('toBankerItems shows the balance as meta via formatAccountCredits')
test('resolveSelectedBanker returns null for undefined, null, and an id not in the roster')  // Review Focus 4
test('resolveSelectedBanker returns a suspended row that is still in the roster')            // Review Focus 3
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/lib/accounts/bankers.test.ts`
Expected: FAIL — cannot resolve `./bankers`.

- [ ] **Step 3: Implement the four functions** in `src/lib/accounts/bankers.ts`.

`compareBankerRows`: usable before unusable (`canUseAccount`), then `name.localeCompare(name)`, then `slug.localeCompare(slug)` so equal names never depend on read order. `describeBankerStatus`: a `Record<AccountStatus, string | null>` — `pending: 'Not yet open'`, `suspended: 'Temporarily off'`, `closed: 'Closed'`, `confirmed` and `active` `null`. `toBankerItems`: sort with `compareBankerRows`, icon `'cash'`, `meta` from `formatAccountCredits(balance)`, `description` and `disabled` from `describeBankerStatus`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/accounts/bankers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounts/bankers.ts src/lib/accounts/bankers.test.ts
git commit -m "feat:accounts(bankers) roster ordering, labels and selection resolution"
```

---

### Task 3: `accounts.q.listBankers`

**Files:**
- Modify: `convex/accounts/q.ts`
- Test: `convex/accounts/bankers.test.ts` (new; `accounts.test.ts` is already long)

**Interfaces:**
- Consumes: `compareBankerRows` from `src/lib/accounts/bankers.ts` (Task 2); `listCreditsForUser` from `convex/credits/helpers.ts`; `getUserByTokenIdentifier` from `convex/users/q.ts`; `accountStatusSchema` from `convex/accounts/d.ts`.
- Produces: `api.accounts.q.listBankers` with args `{}`, returning rows shaped exactly as `BankerRow`.

- [ ] **Step 1: Write the failing tests** in `convex/accounts/bankers.test.ts`.

```ts
test('listBankers returns exactly the five player-safe keys', () => {
  // expect(Object.keys(row).sort()).toEqual(['accountId', 'balance', 'name', 'slug', 'status'])
})
test('listBankers excludes closed houses')
test('listBankers includes pending and suspended houses')
test('listBankers refuses an unauthenticated caller')
test('listBankers reports the caller\'s own balance at a house')
test('listBankers ignores the unlinked opening credits row')      // Review Focus 2
test('listBankers never reports another user\'s balance')
test('listBankers returns zero balances when the caller has no users row')  // Review Focus 1
test('listBankers orders usable houses first')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/accounts/bankers.test.ts`
Expected: FAIL — `api.accounts.q.listBankers` is not a function.

- [ ] **Step 3: Implement the query** in `convex/accounts/q.ts`:

```ts
export const listBankers = query({
  args: {},
  returns: v.array(v.object({
    accountId: v.id('accounts'),
    slug: v.string(),
    name: v.string(),
    status: accountStatusSchema,
    balance: v.number()
  })),
  handler: async (ctx) => { /* … */ }
})
```

Require `ctx.auth.getUserIdentity()`, throwing `ConvexError('Unauthorized.')` when absent — **not** `requireStaffIdentity`. Load the caller's `users` row; when there is none, treat every balance as `0` rather than throwing. Read four `by_status_and_createdAt` takes (`pending`, `confirmed`, `active`, `suspended`), capped at `MAX_LIST_LIMIT` each, so `closed` rows are never read. Build the balance map from `listCreditsForUser(ctx, user._id)`, which is already keyed to a non-null `userId` and so cannot pick up the account's unlinked opening row. Project to the five fields and sort with `compareBankerRows`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/accounts/bankers.test.ts`
Expected: PASS

- [ ] **Step 5: Run the whole suite** — this touches a shared module.

Run: `bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/accounts/q.ts convex/accounts/bankers.test.ts
git commit -m "feat:accounts(listBankers) player-safe roster behind its own validator"
```

---

### Task 4: `SwitcherItem` disabled and meta support

**Files:**
- Modify: `src/components/ui/switcher.btsx` (`SwitcherItem` interface ~line 9; item row ~line 75)

**Interfaces:**
- Produces: `SwitcherItem` gains `disabled?: boolean` and `meta?: string`. Both optional; `AccountSwitcher` and `GameSwitcher` are unaffected.

- [ ] **Step 1: Extend the interface** — add `disabled?: boolean` and `meta?: string` to `SwitcherItem`, each with a one-line comment matching the file's existing style.

- [ ] **Step 2: Apply `disabled` on the item row** — change the hardcoded guard to:

```
disabled={item.disabled === true || item.id === activeItem?.id}
```

- [ ] **Step 3: Render `description` and `meta`** in the item row, reusing the markup conventions the actions list already uses for `meta` (`ml-auto`, `whitespace-nowrap`, muted). `description` is a second line under `label`; both are omitted when absent, so a row without them keeps the layout it has today.

- [ ] **Step 4: Verify nothing regressed**

Run: `bun run typecheck:ts`
Expected: PASS. Then open the preview and confirm the account menu and game menu render as before.

> `bun run typecheck` currently crashes inside `@tsrx/typescript-plugin` (`Error: Invalid TSRX compiler`) on a clean tree too — pre-existing, not caused by this work. Use `typecheck:ts`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/switcher.btsx
git commit -m "feat:ui(switcher) per-item disabled and meta"
```

---

### Task 5: `BankerSwitcher` in the topbar

**Files:**
- Create: `src/components/topbar/BankerSwitcher.btsx`
- Modify: `src/components/topbar/AppHeader.btsx:82-83`

**Interfaces:**
- Consumes: Task 2's `BankerRow`, `toBankerItems`, `resolveSelectedBanker`; Task 3's `api.accounts.q.listBankers`; Task 1's `api.users.m.selectBanker`; `useConvexQuery`, `useFirebaseUser`, `Switcher`.
- Produces: `BankerSwitcher({ onNotify?: (message: string) => void })`.

- [ ] **Step 1: Write the component**, modelled on `AccountSwitcher.btsx` and `GameSwitcher.btsx`.

Subscribe with `useConvexQuery(api.accounts.q.listBankers, {}, { enabled: user !== null })` and read `selectedAccountId` from the existing `useConvexQuery(api.users.q.current, …)`. Render nothing when `user === null`. Pass `busy` while the roster is `undefined` — **`undefined` means "no answer", never "no houses"**. `emptyLabel`: `'No houses yet'` when the roster is an empty array, `'Choose house'` when it has rows but nothing is selected. `activeId` is the resolved selection's `accountId`, or `null`. `icon='cash'`. On select, call `selectBanker` and surface a rejection through `onNotify`.

When the resolved selection is not `canUseAccount` — a house suspended after it was chosen — keep it as the active selection and give the trigger a warning tone (reuse `ACCOUNT_STATUS_TONE.suspended` from `src/lib/asgard/accounts.ts` rather than a new colour). The house changed, not the player's choice, and once credits are involved they need to see that rather than find their selection quietly gone.

- [ ] **Step 2: Mount it** in `AppHeader.btsx` inside the existing `div(className="app-header__account flex items-start gap-2")`, before `AccountSwitcher`, passing `onNotify`.

- [ ] **Step 3: Verify types**

Run: `bun run typecheck:ts`
Expected: PASS

- [ ] **Step 4: Verify in the browser** — `preview_start` the `lucky-pick` config, then check, signed in: the roster lists houses; pending reads "Not yet open" and suspended "Temporarily off", both unclickable; selecting a house updates the trigger and survives a reload; signed out, the control is absent. Check the console for errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/topbar/BankerSwitcher.btsx src/components/topbar/AppHeader.btsx
git commit -m "feat:topbar(BankerSwitcher) choose the house you play against"
```

---

## Done when

`bun run test` and `bun run typecheck:ts` pass, and a signed-in player can pick a house from the topbar on both `/` and `/play`, see pending and suspended houses greyed with a reason, and find their choice still there after a reload.
