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

const ana = member('ana', 'ana@example.com')
const stranger = member('stranger', 'stranger@example.com')

const provision = (t: T) =>
  t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ana Store',
    primaryContact: { name: 'Ana', email: 'ana@example.com' }
  })

/** Signing in is what links the account: it runs the real `linkAccountsToUser`. */
const signIn = (t: T, who: typeof ana) => t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})

const setStatus = (
  t: T,
  accountId: Id<'accounts'>,
  status: 'pending' | 'confirmed' | 'active' | 'suspended' | 'closed'
) =>
  t.run(async (ctx) => {
    await ctx.db.patch(accountId, { status })
  })

const read = (t: T, accountId: Id<'accounts'>) => t.run((ctx) => ctx.db.get('accounts', accountId))

test('the linked contact confirms a pending house', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  expect((await read(t, accountId))!.status).toBe('pending')

  await t.withIdentity(ana).mutation(api.accounts.m.confirmAsContact, { accountId })

  const account = (await read(t, accountId))!
  expect(account.status).toBe('confirmed')
  expect(typeof account.confirmedAt).toBe('number')
  expect(account.confirmedBy).toBe(ana.tokenIdentifier)
  expect(account.updatedBy).toBe(ana.tokenIdentifier)
})

test('a second confirm is refused and does not rewrite confirmedAt', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await t.withIdentity(ana).mutation(api.accounts.m.confirmAsContact, { accountId })
  const first = (await read(t, accountId))!

  await expect(t.withIdentity(ana).mutation(api.accounts.m.confirmAsContact, { accountId })).rejects.toThrow(
    'Unauthorized.'
  )

  expect(await read(t, accountId)).toEqual(first)
})

test('a named but unlinked contact is refused even with a matching verified email', async () => {
  const t = makeT()
  const accountId = await provision(t)
  // Ana holds a verified token for the named email but has never signed in, so
  // nothing has linked her: the contact's tokenIdentifier is still null.
  const before = (await read(t, accountId))!
  expect(before.primaryContact.tokenIdentifier).toBeNull()

  await expect(t.withIdentity(ana).mutation(api.accounts.m.confirmAsContact, { accountId })).rejects.toThrow(
    'Unauthorized.'
  )

  expect(await read(t, accountId)).toEqual(before)
})

test('a signed-in user who is not the contact is refused, and nothing is stored', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await signIn(t, stranger)
  const before = (await read(t, accountId))!

  await expect(t.withIdentity(stranger).mutation(api.accounts.m.confirmAsContact, { accountId })).rejects.toThrow(
    'Unauthorized.'
  )

  expect(await read(t, accountId)).toEqual(before)
})

test('an unauthenticated caller is refused', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  const before = (await read(t, accountId))!

  await expect(t.mutation(api.accounts.m.confirmAsContact, { accountId })).rejects.toThrow('Unauthorized.')

  expect(await read(t, accountId)).toEqual(before)
})

test.each(['confirmed', 'active', 'suspended', 'closed'] as const)(
  'confirming is refused for a %s house',
  async (status) => {
    const t = makeT()
    const accountId = await provision(t)
    await signIn(t, ana)
    await setStatus(t, accountId, status)
    const before = (await read(t, accountId))!

    await expect(t.withIdentity(ana).mutation(api.accounts.m.confirmAsContact, { accountId })).rejects.toThrow(
      'Unauthorized.'
    )

    expect(await read(t, accountId)).toEqual(before)
  }
)

test('myHouses returns exactly the five permitted keys', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)

  const houses = await t.withIdentity(ana).query(api.accounts.q.myHouses, {})

  expect(houses).toHaveLength(1)
  expect(Object.keys(houses[0]!).sort()).toEqual(['accountId', 'confirmedAt', 'name', 'slug', 'status'])
  expect(houses[0]!.accountId).toBe(accountId)
})

test('myHouses returns only the callers own accounts', async () => {
  const t = makeT()
  const anasId = await provision(t)
  const otherId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Stranger Store',
    primaryContact: { name: 'Stranger', email: 'stranger@example.com' }
  })
  await signIn(t, ana)
  await signIn(t, stranger)

  const anas = await t.withIdentity(ana).query(api.accounts.q.myHouses, {})
  const strangers = await t.withIdentity(stranger).query(api.accounts.q.myHouses, {})

  expect(anas.map((h) => h.accountId)).toEqual([anasId])
  expect(strangers.map((h) => h.accountId)).toEqual([otherId])
})

test('myHouses reports confirmedAt as null when unset', async () => {
  const t = makeT()
  await provision(t)
  await signIn(t, ana)

  const [house] = await t.withIdentity(ana).query(api.accounts.q.myHouses, {})

  expect(house!.confirmedAt).toBeNull()
  expect(house!.status).toBe('pending')
})

test('myHouses refuses an unauthenticated caller', async () => {
  const t = makeT()
  await provision(t)

  await expect(t.query(api.accounts.q.myHouses, {})).rejects.toThrow('Unauthorized.')
})

test('after confirmAsContact the house appears in listBankers as confirmed', async () => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)

  await t.withIdentity(ana).mutation(api.accounts.m.confirmAsContact, { accountId })

  const bankers = await t.withIdentity(ana).query(api.accounts.q.listBankers, {})
  expect(bankers.find((b) => b.accountId === accountId)?.status).toBe('confirmed')
  const [house] = await t.withIdentity(ana).query(api.accounts.q.myHouses, {})
  expect(house!.status).toBe('confirmed')
  expect(typeof house!.confirmedAt).toBe('number')
})

// `myHouses` deliberately applies no status filter, unlike `listBankers`: a
// contact must see their own house whatever state it is in.
test.each(['suspended', 'closed'] as const)('myHouses still lists a %s house for its own contact', async (status) => {
  const t = makeT()
  const accountId = await provision(t)
  await signIn(t, ana)
  await setStatus(t, accountId, status)

  const houses = await t.withIdentity(ana).query(api.accounts.q.myHouses, {})

  expect(houses.map((h) => h.status)).toEqual([status])
})
