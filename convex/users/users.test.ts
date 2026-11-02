/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { god, identity, member } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const contact = (email: string, firebaseUid?: string) => ({ name: 'Contact', email, ...(firebaseUid ? { firebaseUid } : {}) })

const createAccount = async (
  t: ReturnType<typeof convexTest>,
  name: string,
  primaryContact: ReturnType<typeof contact>
) => await t.withIdentity(god).mutation(api.accounts.m.create, { name, primaryContact })

const getContact = async (t: ReturnType<typeof convexTest>, accountId: Id<'accounts'>) =>
  (await t.run((ctx) => ctx.db.get(accountId)))!.primaryContact

test('links an account whose contact email matches a verified user', async () => {
  const t = convexTest(schema, modules)
  const accountId = await createAccount(t, 'Ana Store', contact('ana@example.com'))
  expect((await getContact(t, accountId)).tokenIdentifier).toBeNull()

  const userId = await t.withIdentity(member('ana', 'ana@example.com')).mutation(api.users.m.ensureCurrent, {})

  expect(await getContact(t, accountId)).toMatchObject({
    tokenIdentifier: identity('ana').tokenIdentifier,
    firebaseUid: 'ana',
    userId,
    emailVerified: true
  })
})

test('links by firebaseUid', async () => {
  const t = convexTest(schema, modules)
  const accountId = await createAccount(t, 'Ben Store', contact('ben-work@example.com', 'ben'))

  const userId = await t.withIdentity(member('ben', 'ben-home@example.com')).mutation(api.users.m.ensureCurrent, {})

  expect(await getContact(t, accountId)).toMatchObject({
    tokenIdentifier: identity('ben').tokenIdentifier,
    firebaseUid: 'ben',
    userId
  })
})

test('does not link unverified email or a contact reserved for another uid', async () => {
  const t = convexTest(schema, modules)
  const anaAccount = await createAccount(t, 'Ana Store', contact('ana@example.com'))
  await t.withIdentity(member('eve', 'ana@example.com', false)).mutation(api.users.m.ensureCurrent, {})
  expect((await getContact(t, anaAccount)).tokenIdentifier).toBeNull()

  const benAccount = await createAccount(t, 'Ben Store', contact('eve@example.com', 'ben'))
  await t.withIdentity(member('eve', 'eve@example.com')).mutation(api.users.m.ensureCurrent, {})
  expect(await getContact(t, benAccount)).toMatchObject({ tokenIdentifier: null, firebaseUid: 'ben', userId: null })
})

test('never relinks an already linked contact', async () => {
  const t = convexTest(schema, modules)
  const accountId = await createAccount(t, 'Ana Store', contact('ana@example.com'))
  await t.withIdentity(member('ana', 'ana@example.com')).mutation(api.users.m.ensureCurrent, {})
  const linked = await getContact(t, accountId)

  await t.withIdentity(member('mallory', 'ana@example.com')).mutation(api.users.m.ensureCurrent, {})
  await t.withIdentity(member('ana', 'ana@example.com')).mutation(api.users.m.ensureCurrent, {})

  expect(await getContact(t, accountId)).toEqual(linked)
  expect(linked.tokenIdentifier).toBe(identity('ana').tokenIdentifier)
})

const TRX_ADDRESS = 'TVNtoaanAALqt7w6UPZh55xjFFsJkJr9Zy'

const storedUser = async (t: ReturnType<typeof convexTest>, userId: Id<'users'>) =>
  (await t.run((ctx) => ctx.db.get(userId)))!

test('stores and clears a TRON address', async () => {
  const t = convexTest(schema, modules)
  const ana = t.withIdentity(member('ana', 'ana@example.com'))
  const userId = await ana.mutation(api.users.m.ensureCurrent, {})
  expect((await storedUser(t, userId)).trxAddress).toBeUndefined()

  await ana.mutation(api.users.m.setTrxAddress, { trxAddress: `  ${TRX_ADDRESS}  ` })
  expect((await storedUser(t, userId)).trxAddress).toBe(TRX_ADDRESS)

  await ana.mutation(api.users.m.setTrxAddress, { trxAddress: null })
  expect((await storedUser(t, userId)).trxAddress).toBeUndefined()
})

test('a refreshed identity leaves the stored TRON address alone', async () => {
  const t = convexTest(schema, modules)
  const ana = t.withIdentity(member('ana', 'ana@example.com'))
  const userId = await ana.mutation(api.users.m.ensureCurrent, {})
  await ana.mutation(api.users.m.setTrxAddress, { trxAddress: TRX_ADDRESS })

  await ana.mutation(api.users.m.ensureCurrent, {})

  expect((await storedUser(t, userId)).trxAddress).toBe(TRX_ADDRESS)
})

test('refuses a value that is not shaped like a TRON address', async () => {
  const t = convexTest(schema, modules)
  const ana = t.withIdentity(member('ana', 'ana@example.com'))
  await ana.mutation(api.users.m.ensureCurrent, {})

  for (const trxAddress of ['not-an-address', '0xabc', TRX_ADDRESS.slice(1), `${TRX_ADDRESS}Z`, 'T0'.padEnd(34, '1')]) {
    await expect(ana.mutation(api.users.m.setTrxAddress, { trxAddress })).rejects.toThrow()
  }
})

test('refuses an address from a caller with no identity or no row', async () => {
  const t = convexTest(schema, modules)
  await expect(t.mutation(api.users.m.setTrxAddress, { trxAddress: TRX_ADDRESS })).rejects.toThrow()
  await expect(
    t.withIdentity(member('ghost', 'ghost@example.com')).mutation(api.users.m.setTrxAddress, { trxAddress: TRX_ADDRESS })
  ).rejects.toThrow()
})

test('claims an address only onto a row that has none', async () => {
  const t = convexTest(schema, modules)
  const ana = t.withIdentity(member('ana', 'ana@example.com'))
  const userId = await ana.mutation(api.users.m.ensureCurrent, {})

  expect(await ana.query(api.users.q.needsTrxAddress, {})).toBe(true)
  expect(await ana.mutation(api.users.m.claimTrxAddress, { trxAddress: TRX_ADDRESS })).toBe(true)
  expect((await storedUser(t, userId)).trxAddress).toBe(TRX_ADDRESS)

  // A second claim is the other tab, or a stale read. The row keeps the address
  // whose key its owner was given.
  const OTHER = 'TNRHFXq533ALtcisHmYBwcp8dKkfHT518T'
  expect(await ana.mutation(api.users.m.claimTrxAddress, { trxAddress: OTHER })).toBe(false)
  expect((await storedUser(t, userId)).trxAddress).toBe(TRX_ADDRESS)
  expect(await ana.query(api.users.q.needsTrxAddress, {})).toBe(false)
})

test('needsTrxAddress is false without an identity or a row', async () => {
  const t = convexTest(schema, modules)
  expect(await t.query(api.users.q.needsTrxAddress, {})).toBe(false)
  expect(await t.withIdentity(member('ghost', 'ghost@example.com')).query(api.users.q.needsTrxAddress, {})).toBe(false)
})

test('refuses to claim a malformed address', async () => {
  const t = convexTest(schema, modules)
  const ana = t.withIdentity(member('ana', 'ana@example.com'))
  await ana.mutation(api.users.m.ensureCurrent, {})

  await expect(ana.mutation(api.users.m.claimTrxAddress, { trxAddress: 'nope' })).rejects.toThrow()
  expect(await ana.query(api.users.q.needsTrxAddress, {})).toBe(true)
})
