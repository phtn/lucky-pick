/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import type { AccountCreditOption } from '../../src/lib/accounts/accounts'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { auditWallets } from '../ledger/audit'
import { requireAccountManager } from './helpers'
import { god, godB, member, staff, topg } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

const create = (t: T, extra: { initialCredits?: AccountCreditOption; slug?: string } = {}) =>
  t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ana Store',
    primaryContact: { name: 'Ana', email: 'ana@example.com' },
    ...extra
  })

const snapshot = (t: T, accountId: Id<'accounts'>) =>
  t.run(async (ctx) => ({
    account: await ctx.db.get('accounts', accountId),
    wallets: await ctx.db
      .query('wallets')
      .withIndex('by_accountId_and_kind', (q) => q.eq('accountId', accountId))
      .collect(),
    requests: await ctx.db
      .query('topupRequests')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
      .collect(),
    credits: await ctx.db
      .query('credits')
      .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
      .collect()
  }))

test('create opens float and earnings at zero', async () => {
  const t = makeT()
  const accountId = await create(t)

  const { wallets, requests, credits } = await snapshot(t, accountId)
  expect(wallets.map((w) => w.kind).sort()).toEqual(['partnerEarnings', 'partnerFloat'])
  expect(wallets.every((w) => w.available === 0 && w.held === 0)).toBe(true)
  expect(requests).toEqual([])
  // The legacy wallet is no longer opened.
  expect(credits).toEqual([])
})

test('opening grant is pending and creator cannot approve it', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 50_000 })

  const { account, requests, wallets } = await snapshot(t, accountId)
  expect(account!.initialCredits).toBe(50_000)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    status: 'pending',
    amount: 50_000,
    note: 'Opening grant',
    paymentReference: null,
    makerTokenIdentifier: god.tokenIdentifier
  })
  expect(wallets.find((w) => w.kind === 'partnerFloat')!.available).toBe(0)

  await expect(t.withIdentity(god).mutation(api.money.topups.approve, { id: requests[0]._id })).rejects.toThrow(
    'A top-up must be approved by someone other than the god who requested it.'
  )

  await t.withIdentity(godB).mutation(api.money.topups.approve, { id: requests[0]._id })
  const after = await snapshot(t, accountId)
  expect(after.wallets.find((w) => w.kind === 'partnerFloat')!.available).toBe(50_000)
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })
})

test('create with 0 credits files no request', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 0 })

  expect((await snapshot(t, accountId)).requests).toEqual([])
})

test('remove refuses with ledger history', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 50_000 })
  const [request] = (await snapshot(t, accountId)).requests
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id: request._id })

  await expect(t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })).rejects.toThrow(
    'This account has ledger history and cannot be deleted. Close it instead.'
  )
  const after = await snapshot(t, accountId)
  expect(after.account).not.toBeNull()
  expect(after.wallets).toHaveLength(2)
})

test('remove refuses when the account has a user wallet', async () => {
  const t = makeT()
  const accountId = await create(t)
  const userId = await t.withIdentity(member('ben', 'ben@example.com')).mutation(api.users.m.ensureCurrent, {})
  await t.run(async (ctx) => {
    await ctx.db.insert('wallets', {
      kind: 'user',
      accountId,
      userId,
      systemKey: null,
      available: 0,
      held: 0,
      floor: 0,
      status: 'active',
      createdAt: 0,
      updatedAt: 0
    })
  })

  await expect(t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })).rejects.toThrow(
    'This account has ledger history and cannot be deleted. Close it instead.'
  )
})

test('remove deletes an unfunded account with its wallets and unapproved requests', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 5_000 })
  expect((await snapshot(t, accountId)).requests).toHaveLength(1)
  // A cancelled one alongside the pending one.
  await t.run(async (ctx) => {
    const [pending] = await ctx.db
      .query('topupRequests')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
      .take(1)
    const { _id, _creationTime, ...rest } = pending
    await ctx.db.insert('topupRequests', { ...rest, status: 'cancelled' })
  })

  await t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })

  const after = await snapshot(t, accountId)
  expect(after.account).toBeNull()
  expect(after.wallets).toEqual([])
  expect(after.requests).toEqual([])
})

const legacyCreditsRow = (accountId: Id<'accounts'>, balance: number) => ({
  accountId,
  accountSlug: 'ana-store',
  userId: null,
  userTokenIdentifier: null,
  balance,
  granted: balance,
  spent: 0,
  lastReason: 'initial-grant' as const,
  createdAt: 0,
  createdBy: 'x',
  updatedAt: 0,
  updatedBy: 'x'
})

test('remove refuses while a legacy credits row still holds a balance', async () => {
  const t = makeT()
  const accountId = await create(t)
  await t.run((ctx) => ctx.db.insert('credits', legacyCreditsRow(accountId, 300)))

  await expect(t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })).rejects.toThrow(
    'This account has ledger history and cannot be deleted. Close it instead.'
  )

  const after = await snapshot(t, accountId)
  expect(after.account).not.toBeNull()
  expect(after.wallets).toHaveLength(2)
  expect(after.credits).toHaveLength(1)
  expect(after.credits[0].balance).toBe(300)
})

test('remove deletes zero-balance legacy credits rows with an unfunded account', async () => {
  const t = makeT()
  const accountId = await create(t)
  await t.run((ctx) => ctx.db.insert('credits', legacyCreditsRow(accountId, 0)))

  await t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })
  const after = await snapshot(t, accountId)
  expect(after.account).toBeNull()
  expect(after.credits).toEqual([])
})

const ana = () => member('ana', 'ana@example.com')

// An active account whose contact (ana) has signed in and is linked.
const linkedActive = async (t: T) => {
  const accountId = await create(t, { initialCredits: 0 })
  await t.withIdentity(ana()).mutation(api.users.m.ensureCurrent, {})
  await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, status: 'active' })
  return accountId
}

test('staff cannot change the primary contact', async () => {
  const t = makeT()
  const accountId = await create(t)

  await expect(
    t.withIdentity(staff).mutation(api.accounts.m.update, {
      id: accountId,
      primaryContact: { name: 'Mallory', email: 'mallory@example.com' }
    })
  ).rejects.toThrow('This action requires a god account.')

  const updated = await t.withIdentity(staff).mutation(api.accounts.m.update, { id: accountId, name: 'Renamed' })
  expect(updated.name).toBe('Renamed')
  expect(updated.primaryContact.email).toBe('ana@example.com')
})

test('changing the contact email unlinks the previous contact', async () => {
  const t = makeT()
  const accountId = await linkedActive(t)
  await t.withIdentity(ana()).run((ctx) => requireAccountManager(ctx, accountId))

  const updated = await t.withIdentity(god).mutation(api.accounts.m.update, {
    id: accountId,
    primaryContact: { name: 'Bea', email: 'bea@example.com' }
  })

  expect(updated.primaryContact).toMatchObject({
    email: 'bea@example.com',
    tokenIdentifier: null,
    firebaseUid: null,
    userId: null,
    emailVerified: null
  })
  await expect(t.withIdentity(ana()).run((ctx) => requireAccountManager(ctx, accountId))).rejects.toThrow(
    'Unauthorized.'
  )
})

test('editing the contact name keeps the link', async () => {
  const t = makeT()
  const accountId = await linkedActive(t)
  const before = (await snapshot(t, accountId)).account!.primaryContact

  const updated = await t.withIdentity(god).mutation(api.accounts.m.update, {
    id: accountId,
    primaryContact: { name: 'Ana Reyes', email: 'Ana@Example.com' }
  })

  expect(updated.primaryContact.name).toBe('Ana Reyes')
  expect(updated.primaryContact).toMatchObject({
    tokenIdentifier: before.tokenIdentifier,
    firebaseUid: before.firebaseUid,
    userId: before.userId
  })
  expect(before.tokenIdentifier).not.toBeNull()
  await t.withIdentity(ana()).run((ctx) => requireAccountManager(ctx, accountId))
})
