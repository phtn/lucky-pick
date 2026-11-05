# In-app notifications: an inbox for things a player would otherwise never see

## Context

Nothing notification-shaped exists in this repo. There is no table, no inbox,
no unread concept; `onNotify` is an ephemeral client toast that dies with the
render. Meanwhile a set of things happen *to* a player that they currently have
no way to learn about: an operator approves or rejects their top-up, reverses a
transaction on their account, suspends their house, or names them as the contact
of a new one.

Asked for: a notification service within the app. This is the second of the two
specs split during the house-confirmation brainstorm, built second on purpose so
the service would be designed against real consumers rather than one
hypothetical.

### Why a service and not a badge

The case that prompted this — "you have a house awaiting your confirmation" — is
a standing *fact*, already derivable from the live `myHouses` query. A badge
driven off it needs no new storage at all, and was offered as the cheaper answer.

It was rejected in favour of the full service because the other events are not
facts but *occurrences*: a top-up decision or a reversal is gone unless recorded,
and no query reconstructs the moment it happened or whether the player has seen
it. Unread state is the feature, and unread state needs somewhere to live.

Decisions made in brainstorming:

| Topic | Decision |
|---|---|
| Audience | **Players only.** Operators keep asgard, which already shows them everything |
| Addressing | **To a person, by `userId`.** Not to a house |
| Write path | **A shared internal helper, called inline** from each producing mutation |
| Stored content | **`kind` plus parameters, never rendered text.** Copy lives in a pure module |
| Unread count | **Derived client-side** from the one subscription. No second query |
| Read surface | **A bell in the topbar**, beside the banker and account switchers |

### Why per-user addressing

Addressing to the *house* and resolving its current contact on read would survive
a contact change and keep history — but a replacement contact would then read
their predecessor's notifications. That is precisely the leak
`convex/accounts/m.ts` already guards against when it drops
`primaryContact.tokenIdentifier` on a contact swap, with the comment that keeping
it "would let a 'replaced' contact keep partner powers". Per-user addressing has
no such hole.

The consequence, accepted: an event on a house whose contact has **never signed
in** writes no notification, because `primaryContact.userId` is `null` and there
is nobody to address. That matches how such a house is already invisible to
everyone but asgard.

### `credits-granted` is deferred, because the event does not exist

It was chosen in brainstorming, and then could not be specified: `'manual-grant'`
is a `creditReasonSchema` literal in `convex/credits/d.ts:9` that **nothing in
`convex/` ever writes**. There is no grant mutation to hook. Adding the kind now
would mean a branch no producer can reach and a test that asserts nothing.

It is left out of v1 and should be added in the same change that introduces a
grant path — at which point it is one `notify` call and one copy entry.

### Known limitations, accepted

**Five producers are five chances to forget.** Every future mutation that affects
an account becomes a place someone must remember to call `notify`. Nothing
enforces it and no test can catch an omission that was never written. This is the
cost of an explicit write path, taken knowingly in exchange for unread state.

**`house-awaiting-confirmation` fires once, at sign-in.** `linkAccountsToUser` is
the only moment the platform learns a contact exists, so that is where the
notification is written. If the player dismisses it, nothing re-raises it and the
house sits pending with only the `/me` card to find it. Making that one kind
derived from `myHouses` instead would keep it standing until actioned, at the
cost of being the single hybrid in an otherwise uniform design.

**Recorded alternative:** the per-user cap trims the oldest row, which can
evict something *unread* on a busy account. Trimming only read rows, or raising
the cap, would prevent it; both complicate the trim. If unread loss is ever
observed, trimming the oldest **read** row and only falling back to the oldest
row when none is read is the change, and it is local to one helper.

### Out of scope

Email and push of any kind; an operator inbox; per-kind preferences or muting;
grouping or digests; a live toast when one arrives; and `credits-granted` until a
grant path exists.

Status: design approved 2026-11-05. Implementation plan (writing-plans) comes
next, before any code.

---

## Architecture

```
  producing mutations                     notifications            read
  ───────────────────                     ─────────────            ────
  accounts/contacts.ts  linkAccountsToUser ─┐
  accounts/m.ts         update (status)   ──┤
  money/topups.ts       approve / reject  ──┼──▶ notify(ctx, …)  ──▶ table
  ledger/m.ts           reverseTransaction ─┘    internal helper        │
                                                 same transaction       │
                                                 recipient =            │ by_userId_and_createdAt
                                                 account.primaryContact │
                                                   .userId, or nothing  ▼
                                                              notifications.q.mine
                                                                        │
                                                                        ▼
                                              src/lib/notifications/ (pure: copy, unread count)
                                                                        │
                                                                        ▼
                                                            the topbar bell
```

`notify` is an internal helper, **not a public mutation**. Nothing client-side
may create a notification; every row is written by the same transaction as the
event it describes, so a notification cannot survive a rolled-back event nor go
missing from a committed one.

---

## Data

### Schema

A `notifications` table (`convex/notifications/d.ts`), registered in
`convex/schema.ts` with one index, `by_userId_and_createdAt`:

```ts
export const notificationKindSchema = v.union(
  v.literal('house-awaiting-confirmation'),
  v.literal('house-suspended'),
  v.literal('house-closed'),
  v.literal('house-activated'),
  v.literal('topup-approved'),
  v.literal('topup-rejected'),
  v.literal('transaction-reversed')
)

export const notificationFields = {
  userId: v.id('users'),
  kind: notificationKindSchema,
  accountId: v.union(v.id('accounts'), v.null()),
  accountName: v.string(),
  amount: v.union(v.number(), v.null()),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number()
}
```

**The table stores a `kind` and its parameters, never rendered text.** Copy lives
in a pure module, so fixing a typo is a code change rather than a data migration,
and — in a repo with no `.btsx` test harness — the copy is unit-testable at all.
This is the same split `ACCOUNT_STATUS_LABEL` and `src/lib/accounts/bankers.ts`
already use.

`accountName` is denormalized at write time, following `credits.accountSlug`'s
precedent. The house's name *when the event happened* is the truthful thing to
show, not whatever it was later renamed to.

`amount` carries credits for the top-up kinds and is `null` for the rest.

### `notify`

`convex/notifications/helpers.ts`:

```ts
export async function notify(ctx: MutationCtx, args: {
  userId: Id<'users'> | null
  kind: NotificationKind
  accountId: Id<'accounts'> | null
  accountName: string
  amount?: number
}): Promise<void>
```

It accepts a **null `userId` and returns without writing** — that is the
unlinked-contact case, and making every caller guard it would be five copies of
the same `if`.

`amount` is optional on the argument but `v.union(v.number(), v.null())` in
storage, so `notify` maps an absent one to `null` before inserting. Convex
rejects an `undefined` against that validator at runtime, and this exact
mismatch already cost a cycle on `confirmedAt` in the house-confirmation branch.

After inserting, it trims that user's rows to `NOTIFICATION_HISTORY_LIMIT = 100`,
oldest first, following `PLAY_HISTORY_LIMIT` in `convex/plays/d.ts`.

### Producers

| Site | Kind | Recipient |
|---|---|---|
| `accounts/contacts.ts` `linkAccountsToUser` | `house-awaiting-confirmation`, only when the linked account is `pending` | the user being linked |
| `accounts/m.ts` `update`, when `status` changes | `house-suspended` / `house-closed` / `house-activated` | `account.primaryContact.userId` |
| `money/topups.ts` `approve` | `topup-approved` with `amount` | the account's contact |
| `money/topups.ts` `reject` | `topup-rejected` with `amount` | the account's contact |
| `ledger/m.ts` `reverseTransaction` | `transaction-reversed` | resolved from the transaction's `accountId`, then its contact |

`update` must compare against the stored status and write **only on an actual
change** — re-saving an account with the same status is not an event.

`confirmed` is deliberately absent: the player caused it, so telling them is
noise.

### Read and write queries

`notifications.q.mine` — args none, any authenticated identity, narrow explicit
validator, newest first, capped. Resolves the caller's `users` row by
`tokenIdentifier`; a caller with no row yet has no notifications and gets `[]`.

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

`notifications.m.markRead({ notificationId })` and
`notifications.m.markAllRead()`. **`markRead` must verify the row's `userId` is
the caller's** and refuse otherwise with `ConvexError('Unauthorized.')` — a
notification id is not a secret, and without that check one user could mark
another's inbox read. This is the one security-bearing line in the feature.

No separate unread-count query: the list is capped at 100, so the badge counts
off the same subscription rather than paying for a second one.

---

## UI

### Pure module

`src/lib/notifications/notifications.ts`:

```ts
export interface NotificationRow { /* the seven read fields */ }
export interface NotificationItem { id: string; title: string; detail: string | null; href: string | null; isUnread: boolean }
export function toNotificationItems(rows: NotificationRow[]): NotificationItem[]
export function countUnread(rows: NotificationRow[]): number
```

Copy per kind, with `accountName` and `amount` (through the existing
`formatAccountCredits`) interpolated. House kinds link to `/me`; the rest have no
`href` in v1.

### The bell

A topbar control beside `BankerSwitcher` and `AccountSwitcher`, built from
`dropdown-menu.btsx` parts directly — not from `Switcher`, which exists for
choosing between things, not for reading a list.

Shows an unread count when `countUnread > 0`. Opening it lists recent items,
unread ones marked. Clicking one marks it read and follows its `href` if it has
one. A "Mark all read" action when anything is unread.

**Signed out it does not render**, like `BankerSwitcher`. `useConvexQuery`
returns `undefined` for "no answer yet" and that must never render as "no
notifications" — an empty **array** is what means that, and it shows an empty
state inside the open menu rather than hiding the bell, so the control does not
appear and disappear under the player.

This is deliberately the opposite of the "Your houses" card, which is *absent*
when empty, and the difference is not an oversight. That card is one of several
on a page, so an empty one is clutter for the overwhelming majority who contact
no house. The bell is a fixed topbar control with a stable position: one that
vanished whenever the inbox emptied would move its neighbours and teach the
player that it comes and goes.

**There is no `bell` icon** in `src/lib/icons/icons.ts`. Use `message`; adding a
real bell is an `icons:build` step and a separate change.

---

## Testing

`bun test src && vitest run`. Convex tests follow
`convex/accounts/confirmation.test.ts`; pure modules follow
`src/lib/accounts/bankers.test.ts`.

| Test | Asserts |
|---|---|
| `notify` writes | A row with the right kind, recipient and denormalized name |
| `notify` with a null recipient | Writes nothing, and does not throw |
| Each producer | Emits its kind — five cases, driven through the real mutations, not by calling `notify` directly |
| No-op status save | `update` with an unchanged status writes **no** notification |
| Cap | A user past `NOTIFICATION_HISTORY_LIMIT` keeps the newest and drops the oldest |
| `mine` scope | Returns only the caller's rows, never another user's |
| `mine` shape | Exactly the seven permitted keys |
| `mine` with no users row | Returns `[]` rather than throwing |
| **`markRead` authorization** | Another user's notification is refused and stays unread |
| `markAllRead` | Marks only the caller's rows |
| Pure module | Copy per kind, `countUnread`, and the `href` mapping |

The `markRead` authorization test is the one that matters most: it is the only
place in this feature where one player could reach another player's data.
