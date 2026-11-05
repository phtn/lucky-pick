/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import type { Id } from '../_generated/dataModel'
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
