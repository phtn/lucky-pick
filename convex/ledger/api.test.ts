/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { god, member, staff } from '../lib/testIdentities'
import schema from '../schema'
import { post, type PostInput } from './post'
import { getPartnerWallets, getSystemWallet } from './wallets'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const ana = member('ana', 'ana@example.com')
const ben = member('ben', 'ben@example.com')
const zed = member('zed', 'zed@example.com')

/** Two partner accounts, each with a signed-in manager, plus a minted float for A. */
const setup = async () => {
  const t = convexTest(schema, modules)
  const create = async (name: string, email: string) => {
    const id = await t.withIdentity(god).mutation(api.accounts.m.create, { name, primaryContact: { name, email } })
    // New accounts start pending, and only a usable account has a manager.
    await t.run((ctx) => ctx.db.patch(id, { status: 'active' }))
    return id
  }
  const accountA = await create('Ana Store', 'ana@example.com')
  const accountB = await create('Ben Store', 'ben@example.com')
  for (const who of [ana, ben, zed]) await t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})

  const ids = await t.run(async (ctx) => {
    const issuance = await getSystemWallet(ctx, 'issuance')
    const a = await getPartnerWallets(ctx, accountA)
    await getPartnerWallets(ctx, accountB)
    return { issuance: issuance._id, floatA: a.float._id }
  })
  const mintInput: PostInput = {
    kind: 'mint',
    idempotencyKey: 'mint:1',
    actorTokenIdentifier: god.tokenIdentifier,
    accountId: accountA,
    ref: null,
    memo: null,
    legs: [
      { walletId: ids.issuance, bucket: 'available', amount: -500 },
      { walletId: ids.floatA, bucket: 'available', amount: 500 }
    ]
  }
  const { txnId } = await t.run((ctx) => post(ctx, mintInput))
  return { t, accountA, accountB, txnId, ...ids }
}

const available = async (t: ReturnType<typeof convexTest>, id: Id<'wallets'>) =>
  await t.run(async (ctx) => (await ctx.db.get('wallets', id))!.available)

const firstPage = { numItems: 10, cursor: null }

test('balanceForCurrentUser is 0 when signed out or without a wallet, and available once one exists', async () => {
  const { t, accountA } = await setup()
  const slug = (await t.run((ctx) => ctx.db.get('accounts', accountA)))!.slug

  expect(await t.query(api.ledger.q.balanceForCurrentUser, { accountSlug: slug })).toBe(0)
  expect(await t.withIdentity(ana).query(api.ledger.q.balanceForCurrentUser, { accountSlug: slug })).toBe(0)
  expect(await t.withIdentity(ana).query(api.ledger.q.balanceForCurrentUser, { accountSlug: 'nope' })).toBe(0)

  const user = (await t.withIdentity(ana).query(api.users.q.current, {}))!
  await t.run((ctx) =>
    ctx.db.insert('wallets', {
      kind: 'user',
      accountId: accountA,
      userId: user._id,
      systemKey: null,
      available: 75,
      held: 0,
      floor: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1
    })
  )
  expect(await t.withIdentity(ana).query(api.ledger.q.balanceForCurrentUser, { accountSlug: ` ${slug.toUpperCase()} ` })).toBe(75)
  expect(await t.withIdentity(ben).query(api.ledger.q.balanceForCurrentUser, { accountSlug: slug })).toBe(0)
})

test('partnerWallets is readable by staff and the account manager only', async () => {
  const { t, accountA, floatA } = await setup()

  const asManager = await t.withIdentity(ana).query(api.ledger.q.partnerWallets, { accountId: accountA })
  expect(asManager.float?._id).toBe(floatA)
  expect(asManager.float?.available).toBe(500)
  expect(asManager.earnings?.kind).toBe('partnerEarnings')
  expect((await t.withIdentity(staff).query(api.ledger.q.partnerWallets, { accountId: accountA })).float?._id).toBe(floatA)

  await expect(t.query(api.ledger.q.partnerWallets, { accountId: accountA })).rejects.toThrow('Unauthorized.')
  await expect(t.withIdentity(ben).query(api.ledger.q.partnerWallets, { accountId: accountA })).rejects.toThrow('Unauthorized.')
  await expect(t.withIdentity(zed).query(api.ledger.q.partnerWallets, { accountId: accountA })).rejects.toThrow('Unauthorized.')
})

test('walletEntries: the manager and staff read, everyone else is refused', async () => {
  const { t, floatA, issuance } = await setup()

  const page = await t.withIdentity(ana).query(api.ledger.q.walletEntries, { walletId: floatA, paginationOpts: firstPage })
  expect(page.page.map((e) => [e.amount, e.balanceAfter])).toEqual([[500, 500]])
  expect((await t.withIdentity(staff).query(api.ledger.q.walletEntries, { walletId: floatA, paginationOpts: firstPage })).page).toHaveLength(1)
  expect((await t.withIdentity(god).query(api.ledger.q.walletEntries, { walletId: issuance, paginationOpts: firstPage })).page).toHaveLength(1)

  for (const who of [ben, zed]) {
    await expect(
      t.withIdentity(who).query(api.ledger.q.walletEntries, { walletId: floatA, paginationOpts: firstPage })
    ).rejects.toThrow('Unauthorized.')
  }
  await expect(t.query(api.ledger.q.walletEntries, { walletId: floatA, paginationOpts: firstPage })).rejects.toThrow('Unauthorized.')
  // System wallets belong to nobody, so only staff may read them.
  await expect(
    t.withIdentity(ana).query(api.ledger.q.walletEntries, { walletId: issuance, paginationOpts: firstPage })
  ).rejects.toThrow('Unauthorized.')
})

test('walletEntries lets a user read their own wallet and pages newest first', async () => {
  const { t, accountA } = await setup()
  const anaUser = (await t.withIdentity(ana).query(api.users.q.current, {}))!
  const walletId = await t.run((ctx) =>
    ctx.db.insert('wallets', {
      kind: 'user',
      accountId: accountA,
      userId: anaUser._id,
      systemKey: null,
      available: 0,
      held: 0,
      floor: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1
    })
  )
  const txnId = await t.run(async (ctx) => {
    const issuance = await getSystemWallet(ctx, 'issuance')
    const base = { accountId: accountA, actorTokenIdentifier: god.tokenIdentifier, ref: null, memo: null }
    const mint = (n: number): PostInput => ({
      ...base,
      kind: 'mint',
      idempotencyKey: `user-mint:${n}`,
      legs: [
        { walletId: issuance._id, bucket: 'available', amount: -n },
        { walletId, bucket: 'available', amount: n }
      ]
    })
    await post(ctx, mint(10))
    return (await post(ctx, mint(20))).txnId
  })
  expect(txnId).toBeDefined()

  const own = await t.withIdentity(ana).query(api.ledger.q.walletEntries, { walletId, paginationOpts: { numItems: 1, cursor: null } })
  expect(own.page.map((e) => e.balanceAfter)).toEqual([30])
  expect(own.isDone).toBe(false)
  const next = await t
    .withIdentity(ana)
    .query(api.ledger.q.walletEntries, { walletId, paginationOpts: { numItems: 1, cursor: own.continueCursor } })
  expect(next.page.map((e) => e.balanceAfter)).toEqual([10])

  await expect(
    t.withIdentity(ben).query(api.ledger.q.walletEntries, { walletId, paginationOpts: firstPage })
  ).rejects.toThrow('Unauthorized.')
})

test('reverseTransaction needs a god and restores balances', async () => {
  const { t, txnId, floatA, issuance } = await setup()

  for (const who of [staff, ana]) {
    await expect(t.withIdentity(who).mutation(api.ledger.m.reverseTransaction, { txnId, memo: 'oops' })).rejects.toThrow()
  }
  await expect(t.mutation(api.ledger.m.reverseTransaction, { txnId, memo: 'oops' })).rejects.toThrow()
  expect(await available(t, floatA)).toBe(500)

  for (const memo of ['   ', 'x'.repeat(501)]) {
    await expect(t.withIdentity(god).mutation(api.ledger.m.reverseTransaction, { txnId, memo })).rejects.toThrow(
      'A reversal needs a reason of 1 to 500 characters.'
    )
  }

  const reversalId = await t.withIdentity(god).mutation(api.ledger.m.reverseTransaction, { txnId, memo: '  duplicate top-up ' })
  expect(await available(t, floatA)).toBe(0)
  expect(await available(t, issuance)).toBe(0)
  const reversal = (await t.run((ctx) => ctx.db.get('ledgerTransactions', reversalId)))!
  expect(reversal).toMatchObject({ kind: 'reversal', reversesTxnId: txnId, memo: 'duplicate top-up', actorTokenIdentifier: god.tokenIdentifier })

  // A retry replays rather than reversing twice.
  expect(await t.withIdentity(god).mutation(api.ledger.m.reverseTransaction, { txnId, memo: 'again' })).toBe(reversalId)
  expect(await available(t, floatA)).toBe(0)
})

test('setWalletStatus freezes and thaws for gods only, and a frozen wallet refuses postings', async () => {
  const { t, floatA, issuance, accountA } = await setup()
  const mint = (key: string): PostInput => ({
    kind: 'mint',
    idempotencyKey: key,
    actorTokenIdentifier: god.tokenIdentifier,
    accountId: accountA,
    ref: null,
    memo: null,
    legs: [
      { walletId: issuance, bucket: 'available', amount: -5 },
      { walletId: floatA, bucket: 'available', amount: 5 }
    ]
  })

  await expect(t.withIdentity(staff).mutation(api.ledger.m.setWalletStatus, { walletId: floatA, status: 'frozen' })).rejects.toThrow()
  await expect(t.withIdentity(ana).mutation(api.ledger.m.setWalletStatus, { walletId: floatA, status: 'frozen' })).rejects.toThrow()

  expect(await t.withIdentity(god).mutation(api.ledger.m.setWalletStatus, { walletId: floatA, status: 'frozen' })).toBeNull()
  await expect(t.run((ctx) => post(ctx, mint('mint:frozen')))).rejects.toThrow('This wallet is frozen.')

  await t.withIdentity(god).mutation(api.ledger.m.setWalletStatus, { walletId: floatA, status: 'active' })
  await t.run((ctx) => post(ctx, mint('mint:thawed')))
  expect(await available(t, floatA)).toBe(505)
})

test('system wallets cannot be frozen', async () => {
  const { t, issuance } = await setup()
  await expect(
    t.withIdentity(god).mutation(api.ledger.m.setWalletStatus, { walletId: issuance, status: 'frozen' })
  ).rejects.toThrow('System wallets cannot be frozen.')
})
