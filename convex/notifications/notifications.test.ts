/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import type { Id } from '../_generated/dataModel'
import { api } from '../_generated/api'
import { god, godB, member } from '../lib/testIdentities'
import schema from '../schema'
import { NOTIFICATION_HISTORY_LIMIT } from './d'
import { notify } from './helpers'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

const makeUser = (t: T, subject: string) =>
  t.run((ctx) =>
    ctx.db.insert('users', {
      tokenIdentifier: `test|${subject}`,
      firebaseUid: subject,
      email: `${subject}@example.com`,
      createdAt: 0,
      updatedAt: 0,
      subject,
      issuer: 'test',
      nickname: null,
      preferredUsername: null,
      phone: null,
      emailVerified: true
    })
  ) as Promise<Id<'users'>>

test('notify writes a row with the kind, recipient and account name', async () => {
  const t = makeT()
  const userId = await makeUser(t, 'ana')
  await t.run((ctx) =>
    notify(ctx, { userId, kind: 'topup-approved', accountId: null, accountName: 'Ana Store', amount: 500 })
  )
  const rows = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    userId,
    kind: 'topup-approved',
    accountId: null,
    accountName: 'Ana Store',
    amount: 500,
    readAt: null
  })
  expect(typeof rows[0].createdAt).toBe('number')
})

test('notify stores a missing amount as null, not undefined', async () => {
  const t = makeT()
  const userId = await makeUser(t, 'ana')
  await t.run((ctx) => notify(ctx, { userId, kind: 'house-suspended', accountId: null, accountName: 'Ana Store' }))
  const rows = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(rows[0].amount).toBeNull()
})

test('notify with a null userId writes nothing and does not throw', async () => {
  const t = makeT()
  await t.run((ctx) =>
    notify(ctx, { userId: null, kind: 'house-awaiting-confirmation', accountId: null, accountName: 'Ana Store' })
  )
  expect(await t.run((ctx) => ctx.db.query('notifications').collect())).toHaveLength(0)
})

test('notify trims to NOTIFICATION_HISTORY_LIMIT, keeping the newest', async () => {
  const t = makeT()
  const userId = await makeUser(t, 'ana')
  await t.run(async (ctx) => {
    for (let i = 0; i < NOTIFICATION_HISTORY_LIMIT + 3; i++) {
      await notify(ctx, { userId, kind: 'topup-approved', accountId: null, accountName: 'Ana Store', amount: i })
    }
  })
  const rows = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(rows).toHaveLength(NOTIFICATION_HISTORY_LIMIT)
  const amounts = rows.map((r) => r.amount as number)
  expect(Math.min(...amounts)).toBe(3)
  expect(Math.max(...amounts)).toBe(NOTIFICATION_HISTORY_LIMIT + 2)
})

test("notify leaves another user's rows alone when trimming", async () => {
  const t = makeT()
  const ana = await makeUser(t, 'ana')
  const bo = await makeUser(t, 'bo')
  await t.run(async (ctx) => {
    await notify(ctx, { userId: bo, kind: 'house-closed', accountId: null, accountName: 'Bo Store' })
    for (let i = 0; i < NOTIFICATION_HISTORY_LIMIT + 5; i++) {
      await notify(ctx, { userId: ana, kind: 'topup-approved', accountId: null, accountName: 'Ana Store', amount: i })
    }
  })
  const rows = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(rows.filter((r) => r.userId === bo)).toHaveLength(1)
  expect(rows.filter((r) => r.userId === ana)).toHaveLength(NOTIFICATION_HISTORY_LIMIT)
})

// --- Producers: each is driven through the real mutation, not through `notify`. ---

const ana = member('ana', 'ana@example.com')

const provision = (t: T) =>
  t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ana Store',
    primaryContact: { name: 'Ana', email: 'ana@example.com' }
  })

/** Signing in is what links the account: it runs the real `linkAccountsToUser`. */
const signIn = (t: T, who: typeof ana) => t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})

const setStatus = (t: T, accountId: Id<'accounts'>, status: 'pending' | 'confirmed' | 'active' | 'suspended' | 'closed') =>
  t.run(async (ctx) => {
    await ctx.db.patch(accountId, { status })
  })

const allNotifications = (t: T) => t.run((ctx) => ctx.db.query('notifications').collect())

test('linking a contact to a pending house notifies them', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  const rows = await allNotifications(t)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ kind: 'house-awaiting-confirmation', accountId, accountName: 'Ana Store', readAt: null })
  const user = (await t.run((ctx) => ctx.db.query('users').collect()))[0]
  expect(rows[0].userId).toBe(user._id)
})

test('linking a contact to an already-confirmed house notifies nobody', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await setStatus(t, accountId, 'confirmed')
  await signIn(t, ana)
  expect(await allNotifications(t)).toHaveLength(0)
})

test('suspending a house notifies its contact', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await setStatus(t, accountId, 'active')
  await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, status: 'suspended' })
  const rows = (await allNotifications(t)).filter((r) => r.kind !== 'house-awaiting-confirmation')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ kind: 'house-suspended', accountId, accountName: 'Ana Store' })
})

test('re-saving a house with an unchanged status notifies nobody', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await setStatus(t, accountId, 'suspended')
  const before = (await allNotifications(t)).length
  await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, status: 'suspended', name: 'Ana Store 2' })
  await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, name: 'Ana Store 3' })
  expect(await allNotifications(t)).toHaveLength(before)
})

const topupFor = async (t: T, accountId: Id<'accounts'>) =>
  t.withIdentity(god).mutation(api.money.topups.request, { accountId, amount: 5_000, paymentReference: 'GCASH-001' })

test('approving a top-up notifies the contact with the amount', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await setStatus(t, accountId, 'active')
  const id = await topupFor(t, accountId)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id })
  const rows = (await allNotifications(t)).filter((r) => r.kind === 'topup-approved')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ accountId, accountName: 'Ana Store', amount: 5_000 })
})

test('rejecting a top-up notifies the contact with the amount', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await setStatus(t, accountId, 'active')
  const id = await topupFor(t, accountId)
  await t.withIdentity(godB).mutation(api.money.topups.reject, { id, decisionNote: 'No payment found.' })
  const rows = (await allNotifications(t)).filter((r) => r.kind === 'topup-rejected')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ accountId, accountName: 'Ana Store', amount: 5_000 })
})

test("reversing a transaction notifies the account's contact", async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await setStatus(t, accountId, 'active')
  const id = await topupFor(t, accountId)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id })
  await t.withIdentity(ana).mutation(api.money.topups.claim, { id })
  const txnId = (await t.run((ctx) => ctx.db.get('topupRequests', id)))!.txnId!
  await t.withIdentity(god).mutation(api.ledger.m.reverseTransaction, { txnId, memo: 'duplicate' })
  // A retry replays the reversal, so it must not tell the contact twice.
  await t.withIdentity(god).mutation(api.ledger.m.reverseTransaction, { txnId, memo: 'duplicate' })
  const rows = (await allNotifications(t)).filter((r) => r.kind === 'transaction-reversed')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ accountId, accountName: 'Ana Store' })
})

test('an event on a house whose contact never signed in writes nothing and still commits', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await setStatus(t, accountId, 'active')
  await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, status: 'suspended' })
  const id = await topupFor(t, accountId)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id })
  expect(await allNotifications(t)).toHaveLength(0)
  expect((await t.run((ctx) => ctx.db.get('accounts', accountId)))!.status).toBe('suspended')
  expect((await t.run((ctx) => ctx.db.get('topupRequests', id)))!.status).toBe('approved')
})

// --- Reading and marking read. ---

const bo = member('bo', 'bo@example.com')

const userIdOf = async (t: T, who: typeof ana) => {
  await signIn(t, who)
  const user = await t.run((ctx) =>
    ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', who.tokenIdentifier))
      .unique()
  )
  return user!._id
}

const seed = (t: T, userId: Id<'users'>, createdAt: number, amount: number | null = null) =>
  t.run((ctx) =>
    ctx.db.insert('notifications', {
      userId,
      kind: 'topup-approved',
      accountId: null,
      accountName: 'Store',
      amount,
      readAt: null,
      createdAt
    })
  )

test('mine returns exactly the seven permitted keys', async () => {
  const t = makeT()
  const userId = await userIdOf(t, ana)
  await seed(t, userId, 1, 100)
  const rows = await t.withIdentity(ana).query(api.notifications.q.mine, {})
  expect(rows).toHaveLength(1)
  expect(Object.keys(rows[0]).sort()).toEqual(
    ['accountId', 'accountName', 'amount', 'createdAt', 'kind', 'notificationId', 'readAt'].sort()
  )
})

test("mine returns only the caller's rows, newest first", async () => {
  const t = makeT()
  const anaId = await userIdOf(t, ana)
  const boId = await userIdOf(t, bo)
  await seed(t, anaId, 1, 1)
  await seed(t, anaId, 3, 3)
  await seed(t, anaId, 2, 2)
  await seed(t, boId, 4, 4)
  const rows = await t.withIdentity(ana).query(api.notifications.q.mine, {})
  expect(rows.map((r) => r.amount)).toEqual([3, 2, 1])
})

test('mine returns [] for a caller with no users row', async () => {
  const t = makeT()
  expect(await t.withIdentity(ana).query(api.notifications.q.mine, {})).toEqual([])
})

test('mine refuses an unauthenticated caller', async () => {
  const t = makeT()
  await expect(t.query(api.notifications.q.mine, {})).rejects.toThrow('Unauthorized.')
})

test("markRead marks the caller's own row", async () => {
  const t = makeT()
  const userId = await userIdOf(t, ana)
  const id = await seed(t, userId, 1)
  await t.withIdentity(ana).mutation(api.notifications.m.markRead, { notificationId: id })
  const row = await t.run((ctx) => ctx.db.get('notifications', id))
  expect(typeof row!.readAt).toBe('number')
})

test("markRead refuses another user's row and leaves it unread", async () => {
  const t = makeT()
  const anaId = await userIdOf(t, ana)
  await userIdOf(t, bo)
  const id = await seed(t, anaId, 1)
  await expect(t.withIdentity(bo).mutation(api.notifications.m.markRead, { notificationId: id })).rejects.toThrow(
    'Unauthorized.'
  )
  expect((await t.run((ctx) => ctx.db.get('notifications', id)))!.readAt).toBeNull()
})

test("markAllRead marks only the caller's rows", async () => {
  const t = makeT()
  const anaId = await userIdOf(t, ana)
  const boId = await userIdOf(t, bo)
  const a1 = await seed(t, anaId, 1)
  const a2 = await seed(t, anaId, 2)
  const b1 = await seed(t, boId, 3)
  await t.withIdentity(ana).mutation(api.notifications.m.markAllRead, {})
  const read = (id: Id<'notifications'>) => t.run((ctx) => ctx.db.get('notifications', id))
  expect(typeof (await read(a1))!.readAt).toBe('number')
  expect(typeof (await read(a2))!.readAt).toBe('number')
  expect((await read(b1))!.readAt).toBeNull()
})

test('markRead and markAllRead keep an existing readAt', async () => {
  const t = makeT()
  const anaId = await userIdOf(t, ana)
  const id = await seed(t, anaId, 1)
  await t.run((ctx) => ctx.db.patch('notifications', id, { readAt: 1234 }))
  await t.withIdentity(ana).mutation(api.notifications.m.markRead, { notificationId: id })
  expect((await t.run((ctx) => ctx.db.get('notifications', id)))!.readAt).toBe(1234)
  await t.withIdentity(ana).mutation(api.notifications.m.markAllRead, {})
  expect((await t.run((ctx) => ctx.db.get('notifications', id)))!.readAt).toBe(1234)
})
