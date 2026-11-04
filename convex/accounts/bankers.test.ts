/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { god, member } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>
type Status = 'pending' | 'confirmed' | 'active' | 'suspended' | 'closed'

const ana = () => member('ana', 'ana@example.com')
const ben = () => member('ben', 'ben@example.com')

/** Accounts open at `pending`; patch the status directly so the fixture owns no other mutation's rules. */
const house = async (t: T, name: string, status: Status = 'active', extra: { initialCredits?: number } = {}) => {
  const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name,
    primaryContact: { name: 'Owner', email: 'owner@example.com' },
    ...extra
  })
  await t.run(async (ctx) => {
    await ctx.db.patch(accountId, { status })
  })
  return accountId
}

/** A wallet linked to a signed-in user, as it exists once a contact has signed in. */
const giveCredits = (t: T, accountId: Id<'accounts'>, userId: Id<'users'>, balance: number) =>
  t.run(async (ctx) => {
    const account = (await ctx.db.get(accountId))!
    await ctx.db.insert('credits', {
      accountId,
      accountSlug: account.slug,
      userId,
      userTokenIdentifier: null,
      balance,
      granted: balance,
      spent: 0,
      lastReason: 'initial-grant',
      createdAt: 0,
      createdBy: 'test',
      updatedAt: 0,
      updatedBy: 'test'
    })
  })

const signIn = (t: T, who: ReturnType<typeof ana>) => t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})

test('listBankers returns exactly the five player-safe keys', async () => {
  const t = makeT()
  await house(t, 'Casa Uno')
  await signIn(t, ana())

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows).toHaveLength(1)
  expect(Object.keys(rows[0]).sort()).toEqual(['accountId', 'balance', 'name', 'slug', 'status'])
})

test('listBankers excludes closed houses', async () => {
  const t = makeT()
  await house(t, 'Open House')
  await house(t, 'Shut House', 'closed')

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows.map((r) => r.name)).toEqual(['Open House'])
})

test('listBankers includes pending and suspended houses', async () => {
  const t = makeT()
  await house(t, 'Waiting', 'pending')
  await house(t, 'Paused', 'suspended')

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows.map((r) => [r.name, r.status]).sort()).toEqual([
    ['Paused', 'suspended'],
    ['Waiting', 'pending']
  ])
})

test('listBankers refuses an unauthenticated caller', async () => {
  const t = makeT()
  await house(t, 'Casa Uno')

  await expect(t.query(api.accounts.q.listBankers, {})).rejects.toThrow('Unauthorized.')
})

test("listBankers reports the caller's own balance at a house", async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  const userId = await signIn(t, ana())
  await giveCredits(t, accountId, userId, 4_200)

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows[0].balance).toBe(4_200)
})

test('listBankers ignores the unlinked opening credits row', async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno', 'active', { initialCredits: 50_000 })
  await signIn(t, ana())

  // `create` opens the credits row empty and the grant goes to the float, so give the
  // unlinked row a balance of its own: a query that counted it would show 50,000.
  await t.run(async (ctx) => {
    const [row] = await ctx.db
      .query('credits')
      .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
      .collect()
    await ctx.db.patch(row._id, { balance: 50_000, granted: 50_000 })
  })

  // The unlinked row really exists and holds a balance.
  const opening = await t.run((ctx) =>
    ctx.db
      .query('credits')
      .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
      .collect()
  )
  expect(opening).toHaveLength(1)
  expect(opening[0].userId).toBeNull()
  expect(opening[0].balance).toBe(50_000)

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows[0].balance).toBe(0)
})

test("listBankers never reports another user's balance", async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  const anaId = await signIn(t, ana())
  await signIn(t, ben())
  await giveCredits(t, accountId, anaId, 9_000)

  const rows = await t.withIdentity(ben()).query(api.accounts.q.listBankers, {})
  expect(rows[0].balance).toBe(0)
})

test('listBankers returns zero balances when the caller has no users row', async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  const anaId = await signIn(t, ana())
  await giveCredits(t, accountId, anaId, 9_000)

  // Ben is authenticated but has never been ensured into `users`.
  const rows = await t.withIdentity(ben()).query(api.accounts.q.listBankers, {})
  expect(rows).toHaveLength(1)
  expect(rows[0].balance).toBe(0)
})

test('listBankers orders usable houses first', async () => {
  const t = makeT()
  await house(t, 'Aardvark', 'suspended')
  await house(t, 'Bravo', 'active')
  await house(t, 'Alpha', 'pending')
  await house(t, 'Charlie', 'confirmed')

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows.map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Aardvark', 'Alpha'])
})
