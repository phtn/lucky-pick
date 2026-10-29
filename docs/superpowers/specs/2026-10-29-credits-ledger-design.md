# Credits ledger, partner float/earnings, draws, and payouts

## Context

`docs/MONEY.md` is a generic brief (multi-currency, sub-wallets, KYC/AML, processor integrations, 10K TPS). What exists today is a mutable `credits` table (`balance = granted - spent`, `lastReason` only), god-only `grant`/`adjust` mutations, no ledger, and nothing in `src/` calls it. The simulator's pesos (tickets, prizes, settlement board in `src/App.btsx`) are client-side and unpersisted. `users.m.ensureCurrent` is never called, so the `users` table that wallets key on is empty.

Decisions made in brainstorming (these narrow MONEY.md):

| Topic | Decision |
|---|---|
| Money model | **Closed loop.** Users never cash out. |
| Payout target | **Partners** (`accounts`) settle earnings → fiat |
| Top-up | **Manual, admin-issued**, **maker-checker** (2 different gods) |
| Credit types | **Purchased only.** No bonus, no expiry, no sub-wallet categories |
| Currency | **1 credit = ₱1**, integer units, `currency: 'PHP'` recorded on top-ups/payouts |
| Partner wallets | **Float** (top-ups land here, allocated to users) + **Earnings** (accrues from play, only thing payable) |
| User wallets | **One per (account, user)**; only spendable at that partner |
| Spend | **Scheduled shared draws** run by the partner; tickets **hold** credits until settlement |
| Prizes | **In credits, paid from partner earnings** (house model). Earnings **may go negative**; payouts are blocked while negative; there's a per-draw stake cap |
| Allocation | **The partner allocates float → users from its own console** |
| Platform fee | **Taken at payout** (basis points per account) |
| Payout | **Manual batch** with maker-checker; god marks paid with a bank reference |
| Backup | **Convex backups + daily hash-chained ledger export.** No Firestore |
| Ledger | **Double-entry**, immutable entries, materialized balances |

Explicitly out of scope (the design leaves room for each): multi-currency, bonus/expiring credits, user↔user transfers, KYC/AML and fraud scoring, payment-processor integrations, Firestore mirror, 10K TPS. **Regulatory flag:** credit prizes plus partner cash-out resemble what PAGCOR regulates. The ledger works either way, but get a legal read before real partners go live.

Status: design approved 2026-10-29. Each phase below gets its own implementation plan (writing-plans) before any code.

---

## Architecture

```
            ┌──────────── asgard (gods) ─────────────┐        ┌── partner console (account.primaryContact) ──┐
            │ topup requests · approve · payouts     │        │ allocate float→users · draws · request payout │
            └───────────────┬────────────────────────┘        └──────────────────┬────────────────────────────┘
                            │ public mutations (authz first)                     │
                            ▼                                                    ▼
      convex/money/{topups,allocations,payouts}.ts       convex/draws/{draws,tickets,settle}.ts
                            └────────────────► convex/ledger/post.ts ◄──────────┘   (internal only)
                                                     │  one Convex mutation = one atomic posting
                                         wallets · ledgerTransactions · ledgerEntries
                                                     │
                        crons: draw lifecycle · reconciliation · daily export (file storage)
```

All money movement goes through **one internal function, `post()`**. No public mutation patches a wallet directly. Convex mutations are serializable transactions, which covers atomicity and concurrency control (OCC). `post()` adds idempotency and invariants on top.

## Data model (`convex/ledger/d.ts`, `convex/money/d.ts`, `convex/draws/d.ts`)

**`wallets`**: replaces `credits`
- `kind`: `'user' | 'partnerFloat' | 'partnerEarnings' | 'system'`
- `accountId: Id<'accounts'> | null` (null for system), `userId: Id<'users'> | null` (user wallets only), `systemKey: 'issuance' | 'platformFees' | null`
- `available: number`, `held: number` (integers)
- `floor: number | null`: the minimum `available` (0 for user/float; `null` = unbounded for issuance **and partner earnings**, because a prize must always pay. Partner risk is bounded upstream by the per-draw stake cap, not by a floor that could stall settlement.)
- `status: 'active' | 'frozen'`, `createdAt`, `updatedAt`
- indexes: `by_accountId_and_kind`, `by_accountId_and_userId`, `by_userId`, `by_systemKey`

**`ledgerTransactions`**: immutable header
- `kind`: `'mint' | 'allocate' | 'ticketHold' | 'ticketCapture' | 'ticketRelease' | 'prize' | 'payoutReserve' | 'payoutSettle' | 'payoutRelease' | 'reversal' | 'migration'`
- `idempotencyKey` (unique via `by_idempotencyKey`), `payloadHash`, `accountId | null`, `actorTokenIdentifier`, `ref` (tagged union: `{ type: 'topup', id } | { type: 'ticket', id } | { type: 'payout', id } | …`), `memo | null`, `reversesTxnId | null`, `createdAt`
- indexes: `by_idempotencyKey`, `by_accountId_and_createdAt`

**`ledgerEntries`**: immutable legs
- `txnId`, `walletId`, `bucket: 'available' | 'held'`, `amount` (signed int), `balanceAfter`, `createdAt`
- indexes: `by_walletId_and_createdAt`, `by_txnId`

**Invariants** (checked in `post()` and by reconciliation):
1. Every txn's legs sum to 0.
2. The sum over all wallets of `available + held` is 0. Issuance's negative balance is the total credits outstanding.
3. Each wallet's `available`/`held` equals the sum of its entries.
4. `held ≥ 0`; `available ≥ floor`.

### `post(ctx, { kind, idempotencyKey, actor, accountId, ref, memo, legs })`: `convex/ledger/post.ts`
1. Look up `idempotencyKey`. If it exists and `payloadHash` matches, return the existing txn (replay-safe). If the hash differs, throw.
2. Validate: integer non-zero legs, Σ = 0, wallets exist and are `active`.
3. Apply deltas in memory. Check `held ≥ 0` and `available ≥ floor`. On failure, throw a `ConvexError` with a human message (house style, as in `convex/credits/m.ts`).
4. Insert the txn and its entries (with `balanceAfter`), then patch the wallets. All of this happens in the caller's mutation.

`reverse(ctx, txnId, reason)` posts negated legs under key `reversal:<txnId>`. God-only, used for corrections. This replaces today's `credits.m.adjust`.

### Flows (legs)

| Flow | Legs |
|---|---|
| Top-up approved | issuance.available −N · float.available +N |
| Allocate to user | float.available −N · user.available +N |
| Buy ticket | user.available −S · user.held +S *(same doc, no shared hot row)* |
| Draw cancelled | user.held −S · user.available +S |
| Settle ticket (lose) | user.held −S · earnings.available +S |
| Settle ticket (win) | above + earnings.available −P · user.available +P (one txn) |
| Payout requested | earnings.available −G · earnings.held +G |
| Payout paid | earnings.held −G · issuance.available +(G−F) · platformFees.available +F |
| Payout rejected/cancelled | earnings.held −G · earnings.available +G |

## Workflow tables + state machines

**`topupRequests`** (`convex/money/topups.ts`): `accountId, amount, currency: 'PHP', paymentReference, proofStorageId | null, note, status, makerTokenIdentifier, checkerTokenIdentifier | null, decidedAt | null, txnId | null`
`pending → approved (posts mint, key topup:<id>) | rejected | cancelled(by maker)`. The checker must be a god and **≠ maker**.

**`payouts`** (`convex/money/payouts.ts`): `accountId, gross, feeBps, fee, net, currency, payoutDetailsSnapshot, status, requestedBy, approvedBy, paidBy, bankReference, timestamps, txnIds`
`requested (reserve) → approved (checker ≠ requester) → paid (god enters bankReference; posts settle) ; requested|approved → rejected|cancelled (release)`. A request needs `earnings.available ≥ gross`, which also blocks payouts while earnings are negative. `feeBps` comes from a new `accounts.payoutFeeBps` field, defaulting to a constant in `src/lib/accounts/accounts.ts`.

**`draws`** (`convex/draws/`): `accountId, game, opensAt, cutoffAt, drawAt, status, seedHash, seed | null, numbers | null, stakeTotal, stakeCap, settledCount, ticketCount`
`stakeCap` is set by the partner per draw and must be ≤ a new god-controlled `accounts.maxStakePerDraw`; this is the partner's exposure control. Writing `stakeTotal` on the draw doc per ticket serializes purchases within one draw, which is acceptable at v1 volume. If it becomes contended, swap in `@convex-dev/sharded-counter`.
`scheduled → open → closed (cutoff) → drawn → settling → settled ; open|closed → cancelled (release all)`.
**Fairness:** when the draw opens, an action makes a secret seed (`crypto.getRandomValues`) and stores `sha256(seed)` publicly. At `drawAt`, the seed is revealed and the numbers are derived from it deterministically. Anyone can verify.

**`tickets`**: `drawId, accountId, userId, walletId, picks, betType, stake, status: 'held' | 'won' | 'lost' | 'refunded', prize, holdTxnId, settleTxnId | null, clientRequestId`
`buyTicket` is a public mutation. It authenticates via `ctx.auth`, checks the draw is `open` and before `cutoffAt`, checks `stakeTotal + S ≤ stakeCap`, increments `stakeTotal`/`ticketCount` on the draw, and posts the hold with key `ticket:<userId>:<clientRequestId>`.
**Settlement** is an internal mutation that settles ~200 tickets per run with per-ticket keys `settle:<ticketId>`, then reschedules itself until done (`ctx.scheduler.runAfter(0, …)`). Settles therefore retry safely and partner earnings is written one batch at a time.
Prize math is reused from `src/lib/games.ts` (`betPrize`, payout tables), imported across the boundary the same way `convex/accounts` imports `src/lib/accounts/accounts.ts`.

**Crons** (`convex/crons.ts`, `crons.interval`/`crons.cron` only): advance the draw lifecycle (every minute), reconcile (daily), export the ledger (daily).

## Authorization

- Gods: top-up maker/checker, payout approve/pay, reverse, freeze wallet. Use `requireGodIdentity` (`convex/accounts/helpers.ts`).
- Staff: read-only money views. Use `requireStaffIdentity`.
- Partner: a new `requireAccountManager(ctx, accountId)` checks that `identity.tokenIdentifier === account.primaryContact.tokenIdentifier` and that the account passes `canUseAccount(status)`. Covers allocate, draws CRUD, payout request, and reading its own ledger. (`ownerTokenIdentifier` is the creating god, so it doesn't qualify.)
- User: reads their own wallet and tickets and buys tickets. Identity always comes from `ctx.auth`, never from args.
- Rate limits: `@convex-dev/rate-limiter` on `buyTicket` and `allocate`.

## Phases (each gets its own writing-plans implementation plan)

**Phase 0: Identity prerequisites**
- Call `api.users.m.ensureCurrent` on sign-in in `src/lib/convex-client.ts`.
- When an account's contact first signs in, link `primaryContact.userId`/`tokenIdentifier`. There's already precedent for this in `openCredits`.
- Add `requireAccountManager`.

**Phase 1: Ledger core + migration**
- `wallets`, `ledgerTransactions`, `ledgerEntries`, plus `post()` and `reverse()`.
- System wallets get seeded idempotently.
- Migrate each existing `credits` row into that account's `partnerFloat` via a `migration` txn from issuance, then delete the `credits` table and the `convex/credits/*` writers. Keep `balanceForCurrentUser`'s contract, re-pointed at `wallets`.
- `accounts.m.create`: open the float and earnings wallets. An `initialCredits > 0` becomes a **pending top-up request** (the creator is the maker) instead of an instant grant.
- `accounts.m.remove`: refuse when any wallet has entries.

**Phase 2: Top-ups + allocation**
- `topupRequests` and an Asgard queue in the empty **Activity** tab of `src/pages/asgard-accounts-page.btsx`, using the Worker route pattern in `src/server/asgard-account-routes.ts`.
- Partner console route for float balance, allocate to a user by email, and the allocation history (a ledger view reusing `src/components/table/`).

**Phase 3: Draws, tickets, settlement**
- Server-side scheduled draws with commit-reveal.
- `buyTicket`, settlement batches, cancel/refund.
- Wire the simulator's ticket purchase to `buyTicket` for credit play. Free local play stays as-is.

**Phase 4: Partner payouts**
- `payouts` state machine, fee at payout, and a details snapshot.
- Partner "request payout" plus an Asgard approve/mark-paid queue.

**Phase 5: Reconciliation + observability**
- Daily cron checks invariants 2–3 (paginated over wallets) and writes a `reconciliationRuns` row. A mismatch freezes the affected wallets and surfaces on the Asgard overview.
- Daily export: the day's entries go to Convex file storage as JSONL, with each file carrying the previous file's hash (tamper evidence).
- Asgard overview `StatTile`s: credits outstanding (−issuance), float vs earnings totals, pending top-ups and payouts, negative-earnings partners.

## Critical files

- New: `convex/ledger/{d,post,q}.ts`, `convex/money/{d,topups,allocations,payouts}.ts`, `convex/draws/{d,draws,tickets,settle,fairness}.ts`, `convex/crons.ts`, `convex/convex.config.ts` (rate-limiter component)
- Modified: `convex/schema.ts`, `convex/accounts/{d,m,helpers}.ts`, `convex/users/m.ts` (callers), `src/lib/convex-client.ts`, `src/lib/accounts/accounts.ts` (fee default), `src/pages/asgard-accounts-page.btsx`, `src/server/asgard-account-routes.ts`, `src/App.btsx` (phase 3)
- Removed: `convex/credits/*`, after migration
- Reused: `requireGodIdentity` / `requireStaffIdentity` / `getAccountBySlug` (`convex/accounts/helpers.ts`), `canUseAccount`, `src/lib/games.ts` prize math, `src/components/overview/*` tiles, `src/components/table/*` for ledger lists, `src/hooks/use-asgard-summary.ts` fetch pattern.
- Read `convex/_generated/ai/guidelines.md` before each phase (CLAUDE.md requirement).

## Verification

`bun run test` (vitest + `convex-test`, matching `convex/resultsImport.test.ts`) per phase:
- **Ledger:** Σ = 0 after every flow; replaying the same idempotency key returns the same txn; the same key with a different payload throws; overdraft and floor are rejected; a frozen wallet is rejected; `reverse` restores balances.
- **Authz (negative cases):** the maker can't approve their own top-up; partner A can't allocate or request payouts on B; a user can't buy on another user's wallet or past cutoff; non-gods can't mark paid.
- **Draws:** the revealed seed hashes to the commit; a settlement batch interrupted mid-way resumes without double-paying; cancel refunds every hold; the stake cap holds.
- **Payouts:** blocked while earnings are negative; fee math (`net + fee = gross`); a rejection releases the hold.
- **Reconciliation:** a deliberately corrupted wallet is detected and frozen.
- End to end, per phase: `bun run typecheck`, `npx convex dev` against a dev deployment, then exercise the Asgard queue and the partner console in the browser pane via `bun run cf:preview`.
