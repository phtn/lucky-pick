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

test('listBankers returns exactly the seven player-safe keys', async () => {
  const t = makeT()
  await house(t, 'Casa Uno')
  await signIn(t, ana())

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows).toHaveLength(1)
  expect(Object.keys(rows[0]).sort()).toEqual([
    'accountId',
    'balance',
    'contactImageUrl',
    'logoUrl',
    'name',
    'slug',
    'status'
  ])
})

test('listBankers reports the house logo and leaves it null when unset', async () => {
  const t = makeT()
  await house(t, 'No Logo')
  const withLogo = await house(t, 'Has Logo')
  await t.run((ctx) => ctx.db.patch(withLogo, { logoUrl: 'https://cdn.example.com/house.png' }))
  await signIn(t, ana())

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows.map((r) => [r.name, r.logoUrl]).sort()).toEqual([
    ['Has Logo', 'https://cdn.example.com/house.png'],
    ['No Logo', null]
  ])
})

test("listBankers reports the contact's photo as the logo's stand-in", async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  await t.run(async (ctx) => {
    const account = (await ctx.db.get(accountId))!
    await ctx.db.patch(accountId, {
      primaryContact: { ...account.primaryContact, imageUrl: 'https://images.example.com/ada.jpg' }
    })
  })
  await signIn(t, ana())

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows[0].contactImageUrl).toBe('https://images.example.com/ada.jpg')
})

test("listBankers reads the contact's photo from their live users row", async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  // The account is created before the contact signs in, so its `primaryContact`
  // snapshot holds no photo — exactly the state a real house is left in.
  const anaId = await signIn(t, ana())
  await t.run(async (ctx) => {
    await ctx.db.patch(anaId, { imageUrl: 'https://images.example.com/live.jpg' })
    const account = (await ctx.db.get(accountId))!
    expect(account.primaryContact.imageUrl).toBeUndefined()
    await ctx.db.patch(accountId, { primaryContact: { ...account.primaryContact, userId: anaId } })
  })

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows[0].contactImageUrl).toBe('https://images.example.com/live.jpg')
})

test("listBankers prefers the house logo over the contact's live photo", async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  const anaId = await signIn(t, ana())
  await t.run(async (ctx) => {
    await ctx.db.patch(anaId, { imageUrl: 'https://images.example.com/live.jpg' })
    const account = (await ctx.db.get(accountId))!
    await ctx.db.patch(accountId, {
      logoUrl: 'https://cdn.example.com/house.png',
      primaryContact: { ...account.primaryContact, userId: anaId }
    })
  })

  const rows = await t.withIdentity(ana()).query(api.accounts.q.listBankers, {})
  expect(rows[0].logoUrl).toBe('https://cdn.example.com/house.png')
})

test('ensureCurrent stores the photo the client supplies when the token has none', async () => {
  const t = makeT()
  const userId = await t
    .withIdentity(ana())
    .mutation(api.users.m.ensureCurrent, { imageUrl: 'https://images.example.com/ada.jpg' })

  const user = await t.run((ctx) => ctx.db.get(userId))
  expect(user?.imageUrl).toBe('https://images.example.com/ada.jpg')
})

test('ensureCurrent ignores a supplied photo that is not an https address', async () => {
  const t = makeT()
  const userId = await t.withIdentity(ana()).mutation(api.users.m.ensureCurrent, { imageUrl: 'javascript:alert(1)' })

  const user = await t.run((ctx) => ctx.db.get(userId))
  expect(user?.imageUrl).toBeUndefined()
})

test('create refuses a logo that is not an https address', async () => {
  const t = makeT()
  await expect(
    t.withIdentity(god).mutation(api.accounts.m.create, {
      name: 'Casa Uno',
      primaryContact: { name: 'Owner', email: 'owner@example.com' },
      logoUrl: 'javascript:alert(1)'
    })
  ).rejects.toThrow('Logo URL must be a valid https:// address.')
})

test('update stores a logo and clears it back to null', async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')

  const set = await t
    .withIdentity(god)
    .mutation(api.accounts.m.update, { id: accountId, logoUrl: 'https://cdn.example.com/house.png' })
  expect(set.logoUrl).toBe('https://cdn.example.com/house.png')

  const cleared = await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, logoUrl: '' })
  expect(cleared.logoUrl).toBeNull()
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

const owner = () => member('owner', 'owner@example.com')

test('myPlayers lists who chose the contact’s house, with what they hold there and nothing private', async () => {
  const t = makeT()
  const accountId = await house(t, 'Casa Uno')
  const other = await house(t, 'Casa Dos')
  await signIn(t, owner())
  await signIn(t, ana())
  await signIn(t, ben())
  await t.withIdentity(ana()).mutation(api.users.m.selectBanker, { accountId })
  await t.withIdentity(ben()).mutation(api.users.m.selectBanker, { accountId })

  const anaId = await t.run(async (ctx) => {
    const users = await ctx.db.query('users').collect()
    const anaUser = users.find((user) => user.subject === 'ana')!
    await ctx.db.patch(anaUser._id, { nickname: 'Ana' })
    await ctx.db.patch(users.find((user) => user.subject === 'ben')!._id, { nickname: 'Ben' })
    await ctx.db.insert('wallets', {
      kind: 'user',
      accountId,
      userId: anaUser._id,
      systemKey: null,
      available: 300,
      held: 20,
      floor: 0,
      status: 'active',
      createdAt: 0,
      updatedAt: 0
    })
    return anaUser._id
  })

  const houses = await t.withIdentity(owner()).query(api.accounts.q.myPlayers, {})
  // Both houses share the contact's email, so the owner fronts both; only one has players.
  expect(houses.map((h) => [h.name, h.players.length])).toEqual([
    ['Casa Dos', 0],
    ['Casa Uno', 2]
  ])
  const casa = houses.find((h) => h.accountId === accountId)!
  expect(casa.truncated).toBe(false)
  expect(casa.players).toMatchObject([
    { userId: anaId, name: 'Ana', balance: 300, held: 20 },
    { name: 'Ben', balance: 0, held: 0 }
  ])
  expect(Object.keys(casa.players[0]).sort()).toEqual(['balance', 'held', 'imageUrl', 'joinedAt', 'name', 'userId'])
  void other

  // A player is nobody's banker, and a suspended house lists no one.
  expect(await t.withIdentity(ana()).query(api.accounts.q.myPlayers, {})).toEqual([])
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'suspended' }))
  expect((await t.withIdentity(owner()).query(api.accounts.q.myPlayers, {})).map((h) => h.name)).toEqual(['Casa Dos'])
  await expect(t.query(api.accounts.q.myPlayers, {})).rejects.toThrow('Unauthorized.')
})
