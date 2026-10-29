# Credits Ledger: Phases 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mutable `credits` table with a double-entry ledger (wallets, transactions, entries) that every credit movement posts through, mint credits only through maker-checker top-up requests, and make sure the `users` rows and partner identities that wallets depend on actually exist.

**Architecture:** One internal helper, `post()` in `convex/ledger/post.ts`, is the only code that changes a wallet balance. It validates the legs, enforces idempotency, writes immutable `ledgerTransactions` and `ledgerEntries`, and patches materialized `available`/`held` on `wallets`, all inside the caller's Convex mutation. Top-up approval is the only mint path. The existing `credits` rows are migrated into partner float wallets, and then the table is removed.

**Tech Stack:** Convex ^1.46 (queries/mutations, default runtime, Web Crypto), `convex-test` + vitest (edge-runtime), Firebase Auth identities with `god`/`topg`/`admin` claims, bun.

**Spec:** `docs/superpowers/specs/2026-10-29-credits-ledger-design.md`

**Sequencing change from the spec:** the **top-up request backend** (table plus request/approve/reject/cancel/list) moves from Phase 2 into this plan (Task 6). Phase 1 removes `credits.m.grant` and turns the opening grant into a pending request, so without it nothing could mint credits. Phase 2 keeps the Asgard queue UI and partner allocation.

## Global Constraints

- Read `convex/_generated/ai/guidelines.md` before writing Convex code (CLAUDE.md). In particular: validators on every function, `returns` validators, internal functions for anything not client-callable, index names list every field, bounded reads (`.take`/`.paginate`), no wall clock in queries.
- 1 credit = ₱1. Amounts are integers (`Number.isSafeInteger`). `currency: 'PHP'` is recorded on top-ups.
- No public mutation patches `wallets`, inserts `ledgerTransactions`, or inserts `ledgerEntries` directly. Only `post()` does.
- Identity always comes from `ctx.auth.getUserIdentity()`. Never accept a user identifier for authorization.
- Errors users can see are `ConvexError` with a human sentence, matching `convex/credits/m.ts` ("This wallet holds 40 credits, so it cannot give up 50.").
- House style: 2-space indent, single quotes, no semicolons, `d.ts` = validators/types, `m.ts` = mutations, `q.ts` = queries, `helpers.ts` = plain functions over `ctx`. Comments explain *why*, at the density of `convex/accounts/d.ts`.
- Gods: `requireGodIdentity`. Staff reads: `requireStaffIdentity`. Both live in `convex/accounts/helpers.ts`.
- Test identities: issuer `https://securetoken.google.com/lucky-pick-345`, `tokenIdentifier = `${issuer}|${subject}``, the same as `convex/resultsImport.test.ts`.

## Review Focus

1. **A replayed or concurrent approval** (double click, two gods at once) must mint exactly once. The second call throws "already approved", and the ledger holds one `mint`. → Task 6 test `approving twice mints once`.
2. **The maker approving their own request**, including the opening grant created by `accounts.m.create`, must be refused. → Task 6 test `maker cannot approve own request`, Task 7 test `opening grant is pending and creator cannot approve it`.
3. **Malformed amounts** (`0`, `-5`, `1.5`, `NaN`, `Infinity`, `MAX_TOPUP_CREDITS + 1`) must be rejected before anything is written. → Task 6 test `rejects malformed amounts`, Task 4 test `rejects non-integer, zero and unbalanced legs`.
4. **Approving a top-up for a `closed` account** must be refused, and the request stays `pending`. → Task 6 test `cannot approve for a closed account`.
5. **Contact linking by an unverified email**, or onto a contact reserved for a different `firebaseUid`, must not link. Linking would hand partner powers to a stranger. → Task 2 test `does not link unverified email or a contact reserved for another uid`.

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/testIdentities.ts` (new) | Plain identity objects for tests (`god`, `godB`, `topg`, `staff`, `member(subject, email, verified)`). No vitest/convex-test imports, so deploying it is harmless. |
| `convex/accounts/contacts.ts` (new) | `linkAccountsToUser`: attach the accounts whose primary contact is this user |
| `convex/users/m.ts` (modify) | `ensureCurrent` also links accounts |
| `src/lib/convex-client.ts` (modify) | Call `ensureCurrent` once per sign-in |
| `convex/accounts/helpers.ts` (modify) | `requireAccountManager` |
| `convex/ledger/d.ts` (new) | Wallet, transaction, entry, and ref validators/types |
| `convex/ledger/wallets.ts` (new) | Find-or-create system and partner wallets |
| `convex/ledger/post.ts` (new) | `post()`, `reverse()` |
| `convex/ledger/audit.ts` (new) | `auditWallets()` invariant check (tests now, reconciliation cron in Phase 5) |
| `convex/ledger/m.ts` / `q.ts` (new) | God mutations (reverse, freeze) and reads |
| `src/lib/money/credits.ts` (new) | `CREDIT_CURRENCY`, `MAX_TOPUP_CREDITS`, `isTopupAmount` (shared with UI in Phase 2) |
| `convex/money/d.ts`, `convex/money/topups.ts` (new) | Top-up request table + maker-checker mutations |
| `convex/migrations/creditsToWallets.ts` (new) | One-shot batch migration from `credits` into ledger float wallets |
| `convex/accounts/m.ts` (modify) | `create` opens wallets and files the opening grant as a request; `remove` refuses when there is ledger history |
| `convex/schema.ts` (modify) | New tables and an index; `credits` removed in Task 9 |
| `convex/credits/*` (delete) | `m.ts`/`q.ts` in Task 7, `d.ts`/`helpers.ts` in Task 9 |

Tests sit next to the code (`convex/<area>/<name>.test.ts`). Tests in a subdirectory use `const modules = import.meta.glob('../**/*.ts')`. Confirm on the first run that convex-test resolves `_generated` from that glob. If it doesn't, add `convex/test.setup.ts` exporting `import.meta.glob('./**/*.ts')` and import it instead.

---

## Phase 0: Identity prerequisites

### Task 1: Call `ensureCurrent` on sign-in

**Files:**
- Modify: `src/lib/convex-client.ts:56-63`

**Interfaces:**
- Consumes: `api.users.m.ensureCurrent` (existing, `args: {}`, returns `Id<'users'>`)
- Produces: a `users` row exists for every signed-in user. Later tasks rely on `getUserByTokenIdentifier` returning non-null for active users.

- [ ] **Step 1: Wire the call.** Inside the `setAuth` change callback, when `isAuthenticated` becomes `true` for the current `user.uid`, call `convexClient.mutation(api.users.m.ensureCurrent, {})` once per uid. Track the last-ensured uid in a module-level `let ensuredUid: string | null`, and reset it on sign-out so a token refresh doesn't re-run it. Catch and `console.error` failures: a failed upsert must not block sign-in. Import `api` from `'../../convex/_generated/api'` (same as `src/lib/shared-results.ts`).
- [ ] **Step 2: Typecheck.** Run `bun run typecheck`. Expected: exit 0.
- [ ] **Step 3: Verify in the app.** Start `bun run dev` with the browser pane, sign in with Google, then run `npx convex data users`. Expected: one row with your `tokenIdentifier`. Sign out, sign in again: still one row, with a newer `updatedAt`.
- [ ] **Step 4: Commit.** `git commit -m "feat(users): upsert the user row on sign-in"`

### Task 2: Link account primary contacts on sign-in

**Files:**
- Create: `convex/lib/testIdentities.ts`, `convex/accounts/contacts.ts`, `convex/users/users.test.ts`
- Modify: `convex/users/m.ts:27-44`, `convex/schema.ts` (accounts indexes)

**Interfaces:**
- Produces: `linkAccountsToUser(ctx: MutationCtx, user: Doc<'users'>): Promise<Id<'accounts'>[]>`
- Produces: `testIdentities.ts` exports `ISSUER`, `identity(subject: string, claims?: Record<string, unknown>)`, `god`, `godB`, `topg`, `staff` (`admin: true`), and `member(subject: string, email: string, emailVerified = true)`
- Produces: schema index `accounts.by_primaryContact_firebaseUid` on `['primaryContact.firebaseUid']`

Linking rules, which are the security decision here:
1. If `primaryContact.firebaseUid === user.firebaseUid` and `primaryContact.tokenIdentifier === null`, link.
2. Else if `user.emailVerified === true`, `primaryContact.email === user.email?.toLowerCase()`, `primaryContact.tokenIdentifier === null`, **and** `primaryContact.firebaseUid === null`, link. A contact reserved for a specific uid is never claimed by email.

Linking patches `primaryContact.{tokenIdentifier, firebaseUid, userId, emailVerified}` from the user row and touches nothing else. Each lookup is bounded with `.take(25)`.

- [ ] **Step 1: Write failing tests** in `convex/users/users.test.ts`:
  - `links an account whose contact email matches a verified user`: a god creates an account with contact email `ana@example.com` and no uid, then `member('ana', 'ana@example.com')` calls `ensureCurrent`. Expect `primaryContact.tokenIdentifier === identity('ana').tokenIdentifier` and `primaryContact.userId` equal to the returned id.
  - `links by firebaseUid`: a contact created with `firebaseUid: 'ben'` (no user row yet) gets linked when `ben` signs in, even with a different email.
  - `does not link unverified email or a contact reserved for another uid`: `member('eve', 'ana@example.com', false)` leaves the contact unlinked. A contact with `firebaseUid: 'ben'` and email `eve@example.com` stays unlinked when a verified `eve@example.com` signs in.
  - `never relinks an already linked contact`: a second user with the same verified email changes nothing.
- [ ] **Step 2: Run them.** `bunx vitest run convex/users`. Expected: FAIL (contacts not linked).
- [ ] **Step 3: Implement.** Add the index, `linkAccountsToUser` in `convex/accounts/contacts.ts`, and call it from `upsertCurrentUser` after the insert/patch, passing the fresh user doc.
- [ ] **Step 4: Run them.** `bunx vitest run convex/users`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(accounts): link primary contacts when they sign in"`

### Task 3: `requireAccountManager`

**Files:**
- Modify: `convex/accounts/helpers.ts`
- Test: `convex/accounts/helpers.test.ts`

**Interfaces:**
- Produces: `requireAccountManager(ctx: QueryCtx | MutationCtx, accountId: Id<'accounts'>): Promise<{ identity: UserIdentity; account: Doc<'accounts'> }>`. Throws `ConvexError('Unauthorized.')` unless `identity.tokenIdentifier === account.primaryContact.tokenIdentifier` and `canUseAccount(account.status)`. (`ownerTokenIdentifier` is the creating god, so it never qualifies.)

- [ ] **Step 1: Write failing tests** calling the helper as `t.withIdentity(x).run(ctx => requireAccountManager(ctx, id))`:
  - The linked contact on an `active` account gets the account back.
  - The same contact on a `suspended` or `closed` account gets 'Unauthorized.'
  - The god who created the account (the owner), a different member, and an anonymous caller all get 'Unauthorized.'
- [ ] **Step 2: Run, expect FAIL.** `bunx vitest run convex/accounts`
- [ ] **Step 3: Implement.** Reuse `canUseAccount` from `src/lib/accounts/accounts.ts`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(accounts): requireAccountManager guard for partner actions"`

---

## Phase 1: Ledger core + migration

### Task 4: Ledger schema and `post()`

**Files:**
- Create: `convex/ledger/d.ts`, `convex/ledger/wallets.ts`, `convex/ledger/post.ts`, `convex/ledger/audit.ts`
- Modify: `convex/schema.ts`
- Test: `convex/ledger/post.test.ts`

**Interfaces (produces):**

`convex/ledger/d.ts`:
- `walletKindSchema` = `'user' | 'partnerFloat' | 'partnerEarnings' | 'system'`
- `walletBucketSchema` = `'available' | 'held'`
- `systemWalletKeySchema` = `'issuance' | 'platformFees'`
- `walletStatusSchema` = `'active' | 'frozen'`
- `ledgerKindSchema` = every kind in the spec: `'mint' | 'allocate' | 'ticketHold' | 'ticketCapture' | 'ticketRelease' | 'prize' | 'payoutReserve' | 'payoutSettle' | 'payoutRelease' | 'reversal' | 'migration'`
- `ledgerRefSchema` = `v.union(v.object({ type: v.literal('topup'), id: v.id('topupRequests') }), v.object({ type: v.literal('migration'), id: v.string() }))`. Later phases add variants.
- `walletFields`: `kind, accountId: Id<'accounts'>|null, userId: Id<'users'>|null, systemKey: SystemWalletKey|null, available, held, floor: number|null, status, createdAt, updatedAt`
- `ledgerTransactionFields`: `kind, idempotencyKey, payloadHash, accountId|null, actorTokenIdentifier, ref: LedgerRef|null, memo: string|null, reversesTxnId: Id<'ledgerTransactions'>|null, createdAt`
- `ledgerEntryFields`: `txnId, walletId, bucket, amount, balanceAfter, createdAt`
- Types: `WalletKind`, `WalletBucket`, `SystemWalletKey`, `LedgerKind`, `LedgerRef`

Schema tables and indexes:
- `wallets`: `by_accountId_and_kind`, `by_accountId_and_userId`, `by_userId`, `by_systemKey`
- `ledgerTransactions`: `by_idempotencyKey`, `by_accountId_and_createdAt`, `by_reversesTxnId`
- `ledgerEntries`: `by_walletId_and_createdAt`, `by_txnId`
- `topupRequests`: `ledgerRefSchema` references it, so **this task** creates `convex/money/d.ts` (the fields listed in Task 6) and adds the table with its indexes. Task 6 adds only behavior.

`convex/ledger/wallets.ts`:
- `getSystemWallet(ctx, key: SystemWalletKey): Promise<Doc<'wallets'>>` finds or creates it. Floor: `issuance` → `null`, `platformFees` → `0`.
- `getPartnerWallets(ctx: MutationCtx, accountId): Promise<{ float: Doc<'wallets'>; earnings: Doc<'wallets'> }>` finds or creates both. Floors: float `0`, earnings `null` (the spec: prizes must always pay).
- `findPartnerWallets(ctx: QueryCtx, accountId)` is the read-only variant and returns `null`s when missing.

`convex/ledger/post.ts`:
```ts
export type Leg = { walletId: Id<'wallets'>; bucket: WalletBucket; amount: number }
export type PostInput = {
  kind: LedgerKind
  idempotencyKey: string
  actorTokenIdentifier: string
  accountId: Id<'accounts'> | null
  ref: LedgerRef | null
  memo: string | null
  legs: Leg[]
  reversesTxnId?: Id<'ledgerTransactions'>
}
export async function post(ctx: MutationCtx, input: PostInput): Promise<{ txnId: Id<'ledgerTransactions'>; replayed: boolean }>
export async function reverse(ctx: MutationCtx, args: { txnId: Id<'ledgerTransactions'>; actorTokenIdentifier: string; memo: string }): Promise<{ txnId: Id<'ledgerTransactions'>; replayed: boolean }>
```

`post()` rules (decided here, so the implementer doesn't have to guess):
- `payloadHash` = SHA-256 hex (`crypto.subtle.digest`) of `JSON.stringify({ kind, accountId, ref, legs })` with legs in the given order.
- An existing `idempotencyKey` with the same hash returns `{ txnId, replayed: true }` and writes nothing. A different hash throws `ConvexError('This request was already recorded with different details.')`.
- Validation order: `idempotencyKey` is 1–200 chars; 1–16 legs; every `amount` is a non-zero safe integer; the legs sum to 0; every wallet exists and is `active` (frozen → `ConvexError('This wallet is frozen.')`).
- The same wallet may appear in several legs. Deltas apply in leg order, and each entry's `balanceAfter` is that bucket's running value. `held ≥ 0` and `available ≥ floor` are checked on the **final** state per wallet, so a win settles the gross stake and prize together in one transaction.
- Overdraft message: ``This wallet holds ${available} credits, so it cannot give up ${needed}.``
- `reverse()` loads the txn's entries (`by_txnId`, `.take(16)`) and posts negated legs as `kind: 'reversal'`, `idempotencyKey: `reversal:${txnId}``, `reversesTxnId`, with the same `accountId` and a `null` ref. A reversal can't itself be reversed (`ConvexError('A reversal cannot be reversed.')`).

`convex/ledger/audit.ts`:
- `auditWallets(ctx: QueryCtx, limit = 500): Promise<{ total: number; mismatched: Id<'wallets'>[] }>`. `total` = Σ(`available + held`) over wallets. `mismatched` = wallets whose `available`/`held` don't equal the sum of their entries per bucket. Bounded by `limit` (Phase 5 paginates).

- [ ] **Step 1: Write failing tests** in `convex/ledger/post.test.ts` using `t.run` to seed an account and call `post`:
  - `mint then move keeps the ledger balanced`: post issuance −500 / float +500, then float −200 / user-ish wallet +200 (a second float wallet from another account works). Expect balances `-500/300/200`, `auditWallets` → `{ total: 0, mismatched: [] }`, and 4 entries whose `balanceAfter` values are correct.
  - `replaying the same key returns the same txn`: same input twice → same `txnId`, `replayed: true` the second time, one txn row.
  - `same key with different legs throws`
  - `rejects non-integer, zero and unbalanced legs`: `1.5`, `0`, `NaN`, legs summing to 1, 0 legs, 17 legs. Each throws, and the txn and entry tables stay empty.
  - `rejects overdraft on a floor-0 wallet`, with the exact message `This wallet holds 300 credits, so it cannot give up 301.`
  - `lets earnings go negative` (floor `null`)
  - `checks held on the final state`: available −25 / held +25, then held −25 / earnings +25 / earnings −100 / available +100 in one txn → succeeds.
  - `rejects a frozen wallet`
  - `reverse restores balances and refuses to reverse a reversal`
- [ ] **Step 2: Run, expect FAIL.** `bunx vitest run convex/ledger`
- [ ] **Step 3: Implement** `d.ts`, schema, `wallets.ts`, `post.ts`, `audit.ts`.
- [ ] **Step 4: Run, expect PASS.** Then `bun run typecheck`.
- [ ] **Step 5: Commit.** `git commit -m "feat(ledger): double-entry wallets, transactions and post()"`

### Task 5: Ledger reads and god controls

**Files:**
- Create: `convex/ledger/q.ts`, `convex/ledger/m.ts`
- Test: `convex/ledger/api.test.ts`

**Interfaces (produces):**
- `ledger.q.balanceForCurrentUser({ accountSlug: string }) → number`: the same contract as today's `credits.q.balanceForCurrentUser`. Returns `0` when signed out, when the account or user row is missing, or when there's no user wallet. Otherwise returns the user wallet's `available`. Resolve the account via `getAccountBySlug(slug.trim().toLowerCase())` and the user via `getUserByTokenIdentifier`.
- `ledger.q.partnerWallets({ accountId }) → { float: Doc<'wallets'> | null; earnings: Doc<'wallets'> | null }`: staff **or** `requireAccountManager`.
- `ledger.q.walletEntries({ walletId, paginationOpts }) → PaginationResult<Doc<'ledgerEntries'>>`, newest first: staff, or the manager of the wallet's account, or the user who owns the wallet.
- `ledger.m.reverseTransaction({ txnId, memo }) → Id<'ledgerTransactions'>`: god only. `memo` is required and trimmed to 1–500 chars.
- `ledger.m.setWalletStatus({ walletId, status }) → null`: god only. System wallets can't be frozen (`ConvexError('System wallets cannot be frozen.')`).

- [ ] **Step 1: Write failing tests:**
  - `balanceForCurrentUser is 0 when signed out or without a wallet`, and returns `available` once a user wallet is seeded via `t.run`.
  - `walletEntries` authz: the account's manager reads float entries; another member, and the manager of a different account, get 'Unauthorized.'; staff reads all.
  - `reverseTransaction` requires god (staff/admin get a rejection) and restores balances. `setWalletStatus` freezes, and a subsequent `post` on that wallet throws 'This wallet is frozen.'
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ledger): wallet reads, reversal and freeze for gods"`

### Task 6: Maker-checker top-up requests

**Files:**
- Create: `src/lib/money/credits.ts`, `convex/money/topups.ts`
- Consumes: `convex/money/d.ts` and the `topupRequests` table (created in Task 4)
- Test: `convex/money/topups.test.ts`

**Interfaces (produces):**
- `src/lib/money/credits.ts`: `CREDIT_CURRENCY = 'PHP' as const`, `MAX_TOPUP_CREDITS = 10_000_000`, `isTopupAmount(n: number): boolean` (safe integer, `1 ≤ n ≤ MAX_TOPUP_CREDITS`). **`MAX_TOPUP_CREDITS` is a new policy value, not from the spec. It is 10× the largest opening-grant rung. Confirm or change it during review.**
- `convex/money/d.ts`: `topupStatusSchema` = `'pending' | 'approved' | 'rejected' | 'cancelled'`. `topupRequestFields`: `accountId, amount, currency: v.literal('PHP'), paymentReference: string|null, note: string|null, status, makerTokenIdentifier, checkerTokenIdentifier: string|null, decisionNote: string|null, decidedAt: number|null, txnId: Id<'ledgerTransactions'>|null, createdAt, updatedAt`.
- Table `topupRequests` with indexes `by_status_and_createdAt`, `by_accountId_and_createdAt`.
- `createTopupRequest(ctx: MutationCtx, args: { accountId; amount; paymentReference: string | null; note: string | null; makerTokenIdentifier: string }): Promise<Id<'topupRequests'>>`, a helper reused by `accounts.m.create`.
- Mutations (all god-only unless noted):
  - `money.topups.request({ accountId, amount, paymentReference, note? })`: `paymentReference` is required and non-empty here (≤120 chars); `note` is ≤2,000 chars. Account must exist and not be `closed`.
  - `money.topups.approve({ id, decisionNote? })`: status must be `pending`; `checker !== maker` (`ConvexError('A top-up must be approved by someone other than the god who requested it.')`); account not `closed`. Posts `kind: 'mint'`, key `topup:${id}`, `ref: { type: 'topup', id }`, legs issuance.available −amount / float.available +amount. Patches `approved`, the checker, `decidedAt`, and `txnId`.
  - `money.topups.reject({ id, decisionNote })`: any god except the maker; `decisionNote` is required.
  - `money.topups.cancel({ id })`: the maker only, while `pending`.
- Query: `money.topups.list({ status?, accountId?, limit? })`: staff; newest first; limit defaults to 100, capped at 250 (mirroring `accounts/q.ts` `normalizeListLimit`).
- Non-pending transitions throw ``ConvexError(`This top-up is already ${status}.`)``.

- [ ] **Step 1: Write failing tests:**
  - `approving mints into the partner float`: god A requests 5,000, god B approves → float `available` 5,000, issuance −5,000, request `approved` with `txnId`, audit balanced.
  - `maker cannot approve own request`
  - `approving twice mints once`: second approve throws 'This top-up is already approved.'; exactly one `mint` txn.
  - `rejects malformed amounts`: `0, -5, 1.5, NaN, Infinity, 10_000_001`. All throw, and no request row is written.
  - `cannot approve for a closed account`: request stays `pending`, no ledger rows.
  - `only gods act; staff can list`: an `admin`-only identity can call `list` but not request or approve. Only the maker can cancel. Reject needs a note.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(money): maker-checker top-up requests mint into partner float"`

### Task 7: Accounts create/remove on the ledger

**Files:**
- Modify: `convex/accounts/m.ts`
- Delete: `convex/credits/m.ts`, `convex/credits/q.ts`
- Test: `convex/accounts/accounts.test.ts`

**Interfaces:**
- Consumes: `getPartnerWallets`, `createTopupRequest`
- `accounts.m.create`: replace `openCredits` with `getPartnerWallets(ctx, accountId)`. When `initialCredits > 0`, call `createTopupRequest` with `paymentReference: null`, `note: 'Opening grant'`, and `maker = identity.tokenIdentifier`. Keep `initialCredits` on the account as "what was promised" (the existing comment in `accounts/d.ts` still holds).
- `accounts.m.remove`: if either partner wallet has any entry (`ledgerEntries.by_walletId_and_createdAt` `.first()`), or the account has any user wallet, throw `ConvexError('This account has ledger history and cannot be deleted. Close it instead.')`. Otherwise delete its wallets, its `pending`/`cancelled`/`rejected` top-up requests (bounded `.take(100)`), then the account.

- [ ] **Step 1: Write failing tests:**
  - `create opens float and earnings at zero`
  - `opening grant is pending and creator cannot approve it`: creating with `initialCredits: 50_000` → one pending request by the creator; the creator's approve throws; godB's approve → float 50,000.
  - `create with 0 credits files no request`
  - `remove refuses with ledger history`: after the approval above, topg `remove` throws the message. A fresh, unfunded account is removed along with its wallets and requests.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, and delete `credits/m.ts` and `credits/q.ts`. `grep -rn "credits\.\(m\|q\)" src convex` must return nothing.
- [ ] **Step 4: Run, expect PASS**, plus `bun run typecheck`. Re-run Task 2's tests, since they create accounts.
- [ ] **Step 5: Commit.** `git commit -m "feat(accounts): open ledger wallets and file opening grant as a top-up request"`

### Task 8: Migrate `credits` rows into partner float

**Files:**
- Create: `convex/migrations/creditsToWallets.ts`
- Test: `convex/migrations/creditsToWallets.test.ts`

**Interfaces (produces):**
- `migrations.creditsToWallets.run({}) → { migrated: number; done: boolean }`, an **internal** mutation. It takes 100 `credits` rows per batch. For each row with `balance > 0`, it posts `kind: 'migration'`, key `migration:credits:${row._id}`, `ref: { type: 'migration', id: row._id }`, actor `'system:migration'`, memo `credits.${row.lastReason}`, with legs issuance −balance / that account's float +balance. Every row, zero-balance included, is then deleted. If the batch was full, it reschedules itself with `ctx.scheduler.runAfter(0, internal.migrations.creditsToWallets.run, {})`. Rows whose account no longer exists are deleted without posting, and their count is logged.

- [ ] **Step 1: Write failing tests:** seed `credits` rows via `t.run`: two wallets on one account (one per user plus the account-level one, balances 300 and 200), one zero-balance row, and one orphan. Run the migration with `t.finishAllScheduledFunctions(vi.runAllTimers)` (fake timers). Expect float 500, the `credits` table empty, exactly two `migration` txns (the zero-balance and orphan rows post nothing), and the audit balanced. Running it again is a no-op.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(migrations): move credits balances into ledger float wallets"`
- [ ] **Step 6: Run on each deployment.** Push to dev with `npx convex dev --once`, run `npx convex run migrations/creditsToWallets:run`, and confirm `npx convex data credits` is empty. **Prod needs your explicit go-ahead** (`npx convex deploy`, then `npx convex run --prod migrations/creditsToWallets:run`).

### Task 9: Remove the `credits` table

**Files:**
- Modify: `convex/schema.ts` (drop the `credits` table and its import)
- Delete: `convex/credits/d.ts`, `convex/credits/helpers.ts`, `convex/migrations/creditsToWallets.ts` and its test (the migration's record lives in git and in the `migration` txns)

Only do this after Task 8 Step 6 shows `credits` empty on every deployment that matters.

- [ ] **Step 1: Delete and edit**, then `grep -rn "credits/" convex src` → nothing.
- [ ] **Step 2: Verify.** `bun run typecheck && bun run test`. Expected: all pass.
- [ ] **Step 3: Push to dev.** `npx convex dev --once`. Expected: the schema pushes without a validation error.
- [ ] **Step 4: Commit.** `git commit -m "chore(credits): drop the pre-ledger credits table"`

---

## Final verification

- `bun run test`: all suites green, including `convex/resultsImport.test.ts`.
- `bun run typecheck`: exit 0.
- Dev deployment, end to end: sign in (users row exists) → in Asgard, create an account with 5K opening credits (`bun run cf:preview`) → `npx convex data topupRequests` shows one pending request → approving it as a second god via `npx convex run` (the queue UI is Phase 2) → `npx convex data wallets` shows float 5,000 and issuance −5,000.
- Not covered here, by design: the Asgard top-up queue UI, user wallets and allocation (Phase 2), and the reconciliation cron (Phase 5; `auditWallets` is its core).
