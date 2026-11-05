# In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give players an inbox for the things that happen to them — a top-up decided, a transaction reversed, a house suspended or named to them — which nothing currently surfaces.

**Architecture:** A `notifications` table addressed by `userId`, written by an internal `notify` helper called inline from each producing mutation so a notification shares the event's transaction. Rows store a `kind` and its parameters, never rendered text; copy lives in a pure `src/lib` module. One live query feeds a topbar bell, which counts unread client-side.

**Tech Stack:** Convex (queries, mutations, `convex-test`), Octane `.btsx`, Tailwind v4, vitest + `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-05-notifications-design.md`

## Global Constraints

- **Seven kinds, not eight.** `credits-granted` is deferred: `'manual-grant'` is a literal in `convex/credits/d.ts:9` that nothing in `convex/` writes, so there is no event to hook. Do not add the kind.
- `notify` is an **internal helper, never a public mutation** — nothing client-side may create a notification.
- Rows store `kind` plus parameters. **Never store rendered text.**
- `accountName` is denormalized at write time: the house's name *when the event happened*, following `credits.accountSlug`'s precedent.
- `amount` is optional on `notify`'s argument but `v.union(v.number(), v.null())` in storage — **map absent to `null` before inserting.** Convex rejects `undefined` against that validator at runtime; this exact mismatch already cost a cycle on `confirmedAt`.
- `NOTIFICATION_HISTORY_LIMIT = 100`, trimming oldest first. The precedent is `convex/plays/m.ts:65-66`: `.take(LIMIT + 1)` then delete the excess.
- **`markRead` must verify the row's `userId` is the caller's** and refuse with `ConvexError('Unauthorized.')`. A notification id is not a secret; this is the one security-bearing line in the feature.
- No separate unread-count query. The badge counts off the same subscription.
- Signed out, the bell does not render. Signed in with an empty array, it **does** render and shows an empty state inside the menu — the opposite of the `/me` houses card, deliberately: a fixed topbar control that vanishes would move its neighbours.
- **There is no `bell` icon** in `src/lib/icons/icons.ts`. Use `message`.
- `useConvexQuery` returns `undefined` for "no answer yet" and that must never render as a fact.
- This repo has **no `.btsx` test harness** — every test is a pure `.ts` module, and `typecheck:ts` does not cover `.btsx` bodies either.
- Anything reachable from `convex/` uses relative imports and never the `src/lib/icons` barrel (it re-exports a `.btsx` file Convex's `tsc` cannot resolve; broke the repo once in `f705041`).
- Convex error style: `throw new ConvexError('Sentence with a full stop.')` — shown to users as is.
- Checks: `bun run test`, `bun run typecheck:ts`, and `npx tsc -p convex/tsconfig.json --noEmit`. `bun run typecheck` without `:ts` crashes in `@tsrx/typescript-plugin` on a clean tree — pre-existing.
- Out of scope: email, push, an operator inbox, per-kind preferences, grouping, a live arrival toast.

## Review Focus

1. **One player marks another's inbox read.** `markRead` with a notification id belonging to someone else must be refused and leave it unread. — Task 3
2. **A no-op status save spams the inbox.** `accounts.m.update` re-saving an account with its status unchanged must write nothing. — Task 2
3. **An event on a house whose contact never signed in.** `primaryContact.userId` is `null`; `notify` must return without writing and without throwing, so the producing mutation still commits. — Task 1
4. **A top-up with no amount reaches the validator as `undefined`.** It must be stored as `null`. — Task 1
5. **A brand-new sign-in reads the inbox before their `users` row exists.** `mine` must return `[]`, not throw. — Task 3

---

### Task 1: The table and the `notify` helper

**Files:**
- Create: `convex/notifications/d.ts`, `convex/notifications/helpers.ts`
- Modify: `convex/schema.ts` (register the table)
- Test: `convex/notifications/notifications.test.ts`

**Interfaces:**
- Produces: `notificationKindSchema`, `notificationFields`, `NOTIFICATION_HISTORY_LIMIT = 100` from `d.ts`; and from `helpers.ts`:

```ts
export async function notify(ctx: MutationCtx, args: {
  userId: Id<'users'> | null
  kind: NotificationKind
  accountId: Id<'accounts'> | null
  accountName: string
  amount?: number
}): Promise<void>
```

The seven kinds, verbatim: `'house-awaiting-confirmation'`, `'house-suspended'`, `'house-closed'`, `'house-activated'`, `'topup-approved'`, `'topup-rejected'`, `'transaction-reversed'`.

Table fields: `userId: v.id('users')`, `kind`, `accountId: v.union(v.id('accounts'), v.null())`, `accountName: v.string()`, `amount: v.union(v.number(), v.null())`, `readAt: v.union(v.number(), v.null())`, `createdAt: v.number()`. One index: `by_userId_and_createdAt`.

- [ ] **Step 1: Write the failing tests** in `convex/notifications/notifications.test.ts`, following `convex/accounts/confirmation.test.ts` for `convexTest(schema, modules)` and the identities in `convex/lib/testIdentities.ts`. Call `notify` through `t.run(...)`, since it is a helper rather than a mutation.

```ts
test('notify writes a row with the kind, recipient and account name')
test('notify stores a missing amount as null, not undefined')       // Review Focus 4
test('notify with a null userId writes nothing and does not throw') // Review Focus 3
test('notify trims to NOTIFICATION_HISTORY_LIMIT, keeping the newest')
test('notify leaves another user\'s rows alone when trimming')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/notifications/notifications.test.ts`
Expected: FAIL — cannot resolve `convex/notifications/helpers`.

- [ ] **Step 3: Create `convex/notifications/d.ts`** with the kind union, `notificationFields` and `NOTIFICATION_HISTORY_LIMIT`, each with a one-line comment in the style of `convex/plays/d.ts`.

- [ ] **Step 4: Register the table** in `convex/schema.ts` with its single index, matching the file's existing entries.

- [ ] **Step 5: Implement `notify`** in `convex/notifications/helpers.ts`. Return immediately on a null `userId`. Insert with `readAt: null`, `createdAt: Date.now()`, and `amount ?? null`. Then trim: read that user's rows oldest-first with `.take(NOTIFICATION_HISTORY_LIMIT + 1)` and delete the excess, as `convex/plays/m.ts:65-66` does.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run convex/notifications/notifications.test.ts` → PASS
Run: `bun run test` and `npx tsc -p convex/tsconfig.json --noEmit` → green, exit 0

- [ ] **Step 7: Commit**

```bash
git add convex/notifications convex/schema.ts
git commit -m "feat:notifications(notify) the table and its internal write helper"
```

---

### Task 2: Wire the five producers

**Files:**
- Modify: `convex/accounts/contacts.ts` (`linkAccountsToUser`), `convex/accounts/m.ts` (`update`), `convex/money/topups.ts` (`approve`, `reject`), `convex/ledger/m.ts` (`reverseTransaction`)
- Test: `convex/notifications/notifications.test.ts` (extend Task 1's file)

**Interfaces:**
- Consumes: `notify` from Task 1.

| Site | Kind | Recipient | Notes |
|---|---|---|---|
| `linkAccountsToUser` | `house-awaiting-confirmation` | the user being linked | **only** when the account's status is `pending` |
| `accounts.m.update` | `house-suspended` / `house-closed` / `house-activated` | `account.primaryContact.userId` | **only when the status actually changes** — compare against the stored value |
| `topups.approve` | `topup-approved`, with the request's `amount` | the account's contact | `approve` already loads the account |
| `topups.reject` | `topup-rejected`, with the request's `amount` | the account's contact | |
| `reverseTransaction` | `transaction-reversed` | resolved from the transaction's `accountId`, then that account's contact | |

`confirmed` is deliberately **not** a kind: the player caused it, so telling them is noise.

- [ ] **Step 1: Write the failing tests**, appended to Task 1's file. Drive each through the **real mutation**, not by calling `notify` directly — a test that calls the helper proves the helper, not the wiring.

```ts
test('linking a contact to a pending house notifies them')
test('linking a contact to an already-confirmed house notifies nobody')
test('suspending a house notifies its contact')
test('re-saving a house with an unchanged status notifies nobody')   // Review Focus 2
test('approving a top-up notifies the contact with the amount')
test('rejecting a top-up notifies the contact with the amount')
test('reversing a transaction notifies the account\'s contact')
test('an event on a house whose contact never signed in writes nothing and still commits')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/notifications/notifications.test.ts`
Expected: FAIL — no rows written by any producer.

- [ ] **Step 3: Add the `notify` calls** at the five sites. Each resolves its recipient as described in the table above and passes the account's current `name` as `accountName`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/notifications/notifications.test.ts` → PASS
Run: `bun run test` → green (the existing account, topup and ledger suites must still pass — these are live mutations)

- [ ] **Step 5: Commit**

```bash
git add convex/accounts convex/money convex/ledger convex/notifications
git commit -m "feat:notifications(producers) notify on house, top-up and reversal events"
```

---

### Task 3: `mine`, `markRead`, `markAllRead`

**Files:**
- Create: `convex/notifications/q.ts`, `convex/notifications/m.ts`
- Test: `convex/notifications/notifications.test.ts` (extend)

**Interfaces:**
- Produces: `api.notifications.q.mine` (args `{}`), `api.notifications.m.markRead({ notificationId })`, `api.notifications.m.markAllRead()`.

`mine`'s explicit narrow validator, exactly these seven keys:

```ts
v.array(v.object({
  notificationId: v.id('notifications'),
  kind: notificationKindSchema,
  accountId: v.union(v.id('accounts'), v.null()),
  accountName: v.string(),
  amount: v.union(v.number(), v.null()),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number()
}))
```

- [ ] **Step 1: Write the failing tests**, appended.

```ts
test('mine returns exactly the seven permitted keys')
test('mine returns only the caller\'s rows, newest first')
test('mine returns [] for a caller with no users row')          // Review Focus 5
test('mine refuses an unauthenticated caller')
test('markRead marks the caller\'s own row')
test('markRead refuses another user\'s row and leaves it unread')  // Review Focus 1
test('markAllRead marks only the caller\'s rows')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run convex/notifications/notifications.test.ts`
Expected: FAIL — `api.notifications.q.mine` is not a function.

- [ ] **Step 3: Implement `mine`** in `convex/notifications/q.ts`. Require an identity (`ConvexError('Unauthorized.')` when absent), resolve the caller's `users` row via the existing `getUserByTokenIdentifier` from `convex/users/q.ts`, and return `[]` when there is none. Read `by_userId_and_createdAt` in descending order, capped at `NOTIFICATION_HISTORY_LIMIT`, and project the seven fields.

- [ ] **Step 4: Implement `markRead` and `markAllRead`** in `convex/notifications/m.ts`. Both require an identity and the caller's `users` row. `markRead` loads the row and **throws `ConvexError('Unauthorized.')` unless `row.userId` equals the caller's `_id`** — not a filter, a refusal. Set `readAt: Date.now()`, leaving an already-read row alone. `markAllRead` patches the caller's unread rows only.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run convex/notifications/notifications.test.ts` → PASS
Run: `bun run test` and `npx tsc -p convex/tsconfig.json --noEmit` → green, exit 0

- [ ] **Step 6: Commit**

```bash
git add convex/notifications
git commit -m "feat:notifications(mine) read the inbox and mark rows read"
```

---

### Task 4: Pure rendering module

**Files:**
- Create: `src/lib/notifications/notifications.ts`
- Test: `src/lib/notifications/notifications.test.ts`

**Interfaces:**
- Consumes: `formatAccountCredits` from `src/lib/accounts/accounts.ts`.
- Produces:

```ts
export interface NotificationRow {
  notificationId: string
  kind: NotificationKind
  accountId: string | null
  accountName: string
  amount: number | null
  readAt: number | null
  createdAt: number
}

export interface NotificationItem {
  id: string
  title: string
  detail: string | null
  href: string | null
  isUnread: boolean
}

export function toNotificationItems(rows: NotificationRow[]): NotificationItem[]
export function countUnread(rows: NotificationRow[]): number
```

`NotificationKind` is re-declared here as a string-literal union matching the seven kinds — this module must not import from `convex/`.

Copy interpolates `accountName`, and `amount` through `formatAccountCredits`. The four house kinds get `href: '/me'`; `topup-*` and `transaction-reversed` get `null`. `isUnread` is `readAt === null`. Order is newest first, preserving the query's order rather than re-sorting.

- [ ] **Step 1: Write the failing tests** in `src/lib/notifications/notifications.test.ts`, matching `src/lib/accounts/bankers.test.ts`.

```ts
test('toNotificationItems renders a title for each of the seven kinds')  // assert literal copy
test('toNotificationItems interpolates the account name')
test('toNotificationItems formats the amount with formatAccountCredits')
test('toNotificationItems links house kinds to /me and leaves the rest null')
test('toNotificationItems marks a row with a null readAt as unread')
test('countUnread counts only rows with a null readAt')
test('countUnread returns 0 for an empty list')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/lib/notifications/notifications.test.ts`
Expected: FAIL — cannot resolve `./notifications`.

- [ ] **Step 3: Implement both functions**, with this copy exactly. `{name}` is `accountName`; `{amount}` is `formatAccountCredits(amount)`. The spec does not fix these strings, so the plan does — otherwise the tests assert whatever the implementer happened to write.

| Kind | `title` | `detail` |
|---|---|---|
| `house-awaiting-confirmation` | `{name} is waiting for you to confirm` | `You were named as its contact.` |
| `house-suspended` | `{name} was suspended` | `You cannot play against it until it is active again.` |
| `house-closed` | `{name} was closed` | `null` |
| `house-activated` | `{name} is active` | `Players can choose it again.` |
| `topup-approved` | `Top-up approved for {name}` | `{amount} CR was added.` |
| `topup-rejected` | `Top-up rejected for {name}` | `No credits were added.` |
| `transaction-reversed` | `A transaction on {name} was reversed` | `Check the ledger for the correction.` |

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/notifications/notifications.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications
git commit -m "feat:notifications(copy) render inbox rows and count unread"
```

---

### Task 5: The topbar bell

**Files:**
- Create: `src/components/topbar/NotificationBell.btsx`
- Modify: `src/components/topbar/AppHeader.btsx` (the `app-header__account` container, alongside `BankerSwitcher` and `AccountSwitcher`)

**Interfaces:**
- Consumes: Task 3's `api.notifications.q.mine`, `api.notifications.m.markRead`, `api.notifications.m.markAllRead`; Task 4's `toNotificationItems` and `countUnread`.

Built from `dropdown-menu.btsx` parts — `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator` — not from `Switcher`, which exists for choosing between things. `BankerSwitcher.btsx` is the reference for the subscription, mutation and error-surfacing shape.

- [ ] **Step 1: Write the component.** Subscribe with `useConvexQuery(api.notifications.q.mine, {}, { enabled: user !== null })`. Render nothing when signed out. `icon='message'`. Show the unread count when `countUnread(rows) > 0`. The open menu lists items; an unread one is visually marked; clicking one calls `markRead` and follows its `href` when it has one. A "Mark all read" action appears only when something is unread. An **empty array renders the bell with an empty state inside the menu** — only `undefined` and signed-out suppress the control, and `undefined` shows it in its loading state rather than as "nothing to read".

- [ ] **Step 2: Mount it** in `AppHeader.btsx` inside the existing `div(className="app-header__account flex items-start gap-2")`, before `BankerSwitcher`.

- [ ] **Step 3: Verify types**

Run: `bun run typecheck:ts` → exit 0
Run: `npx tsc -p convex/tsconfig.json --noEmit` → exit 0
Run: `bun run test` → green

- [ ] **Step 4: Verify what you honestly can in the browser.** Start the preview from `.claude/launch.json`'s `lucky-pick` config — **your own server**; one already running on another port serves a different checkout. Confirm the signed-out header renders with no bell and no console errors. If the workspace has no `.dev.vars`, the signed-in path is **not** verifiable: do not copy secrets, do not stub auth, and report exactly which states you saw and which you could not.

- [ ] **Step 5: Commit**

```bash
git add src/components/topbar/NotificationBell.btsx src/components/topbar/AppHeader.btsx
git commit -m "feat:topbar(NotificationBell) read what happened while you were away"
```

---

## Done when

`bun run test`, `bun run typecheck:ts` and `npx tsc -p convex/tsconfig.json --noEmit` all pass, and a signed-in contact sees a bell that counts unread notifications, lists them newest first, marks them read on click, and takes house notifications to `/me`.
