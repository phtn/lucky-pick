/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { god, member } from '../lib/testIdentities'
import schema from '../schema'
import { requireAccountManager } from './helpers'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

type Status = 'active' | 'suspended' | 'closed'

// A god provisions the account, then its contact signs in, which links them as the account's manager.
const linkedAccount = async (status: Status = 'active') => {
  const t = convexTest(schema, modules)
  const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ana Store',
    primaryContact: { name: 'Ana', email: 'ana@example.com' }
  })
  await t.withIdentity(member('ana', 'ana@example.com')).mutation(api.users.m.ensureCurrent, {})
  await t.run((ctx) => ctx.db.patch(accountId, { status }))
  return { t, accountId }
}

const guard = (t: ReturnType<typeof convexTest>, accountId: Id<'accounts'>) => t.run((ctx) => requireAccountManager(ctx, accountId))

test('the linked contact of an active account gets the account back', async () => {
  const { t, accountId } = await linkedAccount('active')

  const result = await t.withIdentity(member('ana', 'ana@example.com')).run((ctx) => requireAccountManager(ctx, accountId))

  expect(result.account._id).toBe(accountId)
  expect(result.identity.subject).toBe('ana')
})

test.each(['suspended', 'closed'] as const)('the linked contact of a %s account is refused', async (status) => {
  const { t, accountId } = await linkedAccount(status)

  await expect(
    t.withIdentity(member('ana', 'ana@example.com')).run((ctx) => requireAccountManager(ctx, accountId))
  ).rejects.toThrow('Unauthorized.')
})

test('the god who created the account is not its manager', async () => {
  const { t, accountId } = await linkedAccount('active')

  await expect(t.withIdentity(god).run((ctx) => requireAccountManager(ctx, accountId))).rejects.toThrow('Unauthorized.')
})

test('a different member is refused', async () => {
  const { t, accountId } = await linkedAccount('active')

  await expect(
    t.withIdentity(member('eve', 'eve@example.com')).run((ctx) => requireAccountManager(ctx, accountId))
  ).rejects.toThrow('Unauthorized.')
})

test('an anonymous caller is refused', async () => {
  const { t, accountId } = await linkedAccount('active')

  await expect(guard(t, accountId)).rejects.toThrow('Unauthorized.')
})

test('an unlinked contact slot never matches a caller', async () => {
  const t = convexTest(schema, modules)
  const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ben Store',
    primaryContact: { name: 'Ben', email: 'ben@example.com' }
  })
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))

  await expect(
    t.withIdentity(member('ben', 'ben@example.com')).run((ctx) => requireAccountManager(ctx, accountId))
  ).rejects.toThrow('Unauthorized.')
})
