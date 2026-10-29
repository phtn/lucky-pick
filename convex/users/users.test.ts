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
