# House confirmation: a contact accepts the account that was provisioned for them

## Context

Asgard provisions an account with a `primaryContact` — a name and an email — and
opens it at `pending` (`DEFAULT_ACCOUNT_STATUS`). When that person later signs in
with a verified copy of the address, or with a `firebaseUid` a god pre-set,
`linkAccountsToUser` attaches them: `primaryContact.tokenIdentifier` is filled in.

**The status does not move.** Linking proves who the contact is; nothing acts on
it. So an account sits at `pending` until an operator edits it by hand, and the
banker picker shipped on 2026-11-05 renders it, correctly but uselessly, as
"Not yet open" with no way out of that state.

Asked for: a way for an account to confirm it is a House account, and an in-app
notification service.

### This is one of two specs

The request is two subsystems. Notifications are greenfield — no table, no
inbox, no unread concept exists anywhere in the repo; `onNotify` is an ephemeral
client toast. Confirmation is a single status transition with a new
authorization shape.

They are being built confirmation-first, so the notification service is designed
against a real consumer rather than a hypothetical one. **Notifications get
their own spec and are out of scope here.**

Decisions made in brainstorming:

| Topic | Decision |
|---|---|
| Who confirms | **The linked primary contact**, and nobody else. Asgard keeps its existing staff-gated path through `accounts.m.update` |
| What confirming takes | **One click.** No payout details, no terms acceptance — payout stays arranged out of band as it is today |
| Declining | **Not in v1.** Ignoring the prompt is declining; the account stays `pending` and asgard can close it |
| Reach | **In-app only.** Nothing outbound |
| Surface | **A card on `/me`**, not a bespoke banner — the notification service is the discovery mechanism, and it lands next |
| Transition owner | **A dedicated mutation with its own guard**, not a widened `accounts.m.update` |

### Known limitation, accepted

With in-app-only reach and a card on `/me`, a contact learns they have a house to
confirm only by visiting their profile. Confirmation therefore ships
half-useful, by design, until the notification spec lands. The answer to that is
to build notifications next, not to add a banner this spec would then have to
unbuild.

Separately: `linkAccountsToUser` attaches a contact only on sign-in. A house
whose named contact has never signed in has nobody to show this to, and stays
`pending` and invisible to everyone but asgard. That is correct behaviour, and
it is why some pending houses will simply sit there.

### Out of scope

Declining; payout details; terms acceptance; any outbound email or push; the
notification service; accounts whose contact has never signed in; more than one
contact per account; and any change to how asgard sets status.

Status: design approved 2026-11-05. Implementation plan (writing-plans) comes
next, before any code.

---

## Architecture

```
  asgard provisions          contact signs in              contact confirms
  ─────────────────          ────────────────              ────────────────
  accounts.m.create          linkAccountsToUser            accounts.m.confirmAsContact
  status: 'pending'          sets primaryContact            requirePendingAccountContact
  contact: name + email      .tokenIdentifier               status: 'confirmed'
         │                          │                       confirmedAt/By
         ▼                          ▼                              │
  ┌──────────────────────────────────────────────────────┐        │
  │                   accounts table                     │◀───────┘
  └──────────────────────────────────────────────────────┘
         │                                      │
         │ by_primaryContact_tokenIdentifier    │ by_status_and_createdAt
         ▼                                      ▼
  accounts.q.myHouses                    accounts.q.listBankers
  (the /me card)                         (the topbar picker)
                                          canUseAccount → now selectable
```

The two reads are already separated by index and by validator. Confirmation
writes the status that moves a house from one side of `canUseAccount` to the
other, and Convex's reactivity does the rest.

---

## Data

### Schema change

Two fields on `accountSchema` (`convex/accounts/d.ts`):

```ts
confirmedAt: v.optional(v.number()),
confirmedBy: v.optional(v.string())
```

This records a specific transition on the account document, exactly as
`closedAt` / `closedBy` / `closeReason` already do.

**They differ from the close fields deliberately:** those are
`v.union(…, v.null())` and are written at creation, so every document has them.
Existing accounts have no confirmation fields, so a non-optional addition would
make live documents schema-invalid and require a backfill through
`@convex-dev/migrations`. Optional avoids the migration. The inconsistency is a
cost, recorded here so it does not read as an oversight later.

### `accounts.m.confirmAsContact`

New mutation in `convex/accounts/m.ts`. Args `{ accountId: v.id('accounts') }`,
returns `v.null()`.

Guard, then patch `status: 'confirmed'`, `confirmedAt: Date.now()`,
`confirmedBy: identity.tokenIdentifier`, and the usual `updatedAt` / `updatedBy`.

### `requirePendingAccountContact`

New helper in `convex/accounts/helpers.ts`, beside the existing guards.

It **cannot** reuse `requireAccountManager`, which requires
`canUseAccount(status)` — `confirmed` or `active`. A pending account's own
contact fails that by definition. That is the chicken-and-egg this whole spec
exists to break, and the reason the new guard is narrower rather than a
parameter on the old one.

Requires: an identity; the account to exist; `primaryContact.tokenIdentifier`
to equal the caller's; and `status === 'pending'`. Throws a single
`ConvexError('Unauthorized.')` for every failure — matching
`requireAccountManager`'s stated reasoning that one refusal should cover "not
yours" and "not in a state you may act on" without telling the caller which.

### `accounts.q.myHouses`

New query in `convex/accounts/q.ts`. Args none. Guarded on any authenticated
identity. Reads the caller's accounts through the existing
`by_primaryContact_tokenIdentifier` index.

Explicit narrow `returns` validator, the same discipline `listBankers` uses:

```ts
v.array(v.object({
  accountId:   v.id('accounts'),
  slug:        v.string(),
  name:        v.string(),
  status:      accountStatusSchema,
  confirmedAt: v.union(v.number(), v.null())
}))
```

The caller is the account's own contact and could defensibly be shown more, but
the card needs none of it. Narrow stays narrow: payout details, billing email,
notes and `ownerTokenIdentifier` are operator data and do not cross.

Two details the shape implies. The stored field is `v.optional(v.number())` but
the returned one is `v.union(v.number(), v.null())`, so the handler must map a
missing value to `null` explicitly — returning `undefined` fails the validator.
And unlike `listBankers`, this query needs no `users` row at all: it matches on
`identity.tokenIdentifier` directly, so a contact who has just signed in sees
their houses even before any row exists for them.

---

## UI

### The card

A **"Your houses"** card on `/me` (`src/pages/profile-page.btsx`), listing each
linked account with its status.

| Row status | Renders |
|---|---|
| `pending` | Name, "Waiting for you to confirm", and a confirm button |
| `confirmed` / `active` | Name and status; no action |
| `suspended` / `closed` | Name and status; no action |

Absent entirely when the caller is linked to no accounts — most players are not
house contacts, and an empty card is clutter.

As everywhere else in this repo, the testable logic lives in a pure `.ts` module
under `src/lib/accounts/` and the component stays thin: there is **no `.btsx`
test harness**, and `typecheck:ts` does not cover `.btsx` either.

### Reactivity is an acceptance criterion

`myHouses` and `listBankers` are both live Convex subscriptions. Confirming must
make the house appear as selectable in the topbar picker **without a reload**.
This falls out of the architecture rather than needing code, which is exactly
why it should be asserted rather than assumed.

### One targeted improvement, included

`ACCOUNT_STATUS_LABEL`, `ACCOUNT_STATUS_ICON` and `ACCOUNT_STATUS_TONE` live in
`src/lib/asgard/accounts.ts`, a module that also carries the asgard account API
client. `BankerSwitcher` already reaches into that operator namespace for the
suspended tone; this card would be the second player-side consumer. The
whole-branch reviewer flagged it as a real blurring of the boundary the banker
spec exists to draw, and as a defect in that plan rather than its execution.

Move those three records to `src/lib/accounts/accounts.ts`, where
`ACCOUNT_STATUS_VALUES` already lives. `ACCOUNT_STATUS_FILTERS` and
`ACCOUNT_STATUS_FILTER_LABEL` are console concepts and **stay** in the asgard
module, importing the label record from its new home.

Four files update their imports: `src/lib/asgard/accounts.ts`,
`src/components/asgard/accounts-panel.btsx`,
`src/components/asgard/status-badge.btsx`, and
`src/components/topbar/BankerSwitcher.btsx`. No behaviour changes.

---

## Testing

`bun test src && vitest run`. Convex tests follow `convex/accounts/accounts.test.ts`;
pure modules follow `src/lib/profile/stats.test.ts`.

| Test | Asserts |
|---|---|
| Happy path | The linked contact of a `pending` account confirms; status becomes `confirmed` and both audit fields are written |
| Wrong user | A signed-in user who is not the contact is refused, and nothing is stored |
| Unauthenticated | Refused |
| Wrong status | Refused for `confirmed`, `active`, `suspended` and `closed` — the already-confirmed case especially, since a double click is the likely way to hit it |
| Unlinked contact | An account whose `primaryContact.tokenIdentifier` is still `null` is refused even when the caller's email matches it |
| `myHouses` scope | Returns only the caller's own accounts, never another contact's |
| `myHouses` shape | Exactly the five permitted keys, so a later field on `accounts` fails the test rather than leaking |
| Reactive outcome | After `confirmAsContact`, `listBankers` reports that house with a `canUseAccount` status |

The "unlinked contact" case is the one worth care: it is the difference between
*being named* as a contact and *having proved* you are that contact, and the
guard must turn on `tokenIdentifier`, never on the email.
