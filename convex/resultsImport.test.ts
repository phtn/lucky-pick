/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const issuer = 'https://securetoken.google.com/lucky-pick-345'
const identity = { issuer, subject: 'importer', tokenIdentifier: `${issuer}|importer` }
const row = (day: string, numbers = '01-02-03-04-05-06') => `Lotto 6/42\t${numbers}\t${day}\t10,000,000.00\t0`
const lottoPage = { game: 'lotto' as const, paginationOpts: { numItems: 100, cursor: null } }

test('public reads are allowed; anonymous and wrong-issuer identities cannot import', async () => {
  const t = convexTest(schema, modules)
  expect(await t.query(api.resultsImport.access, {})).toEqual({ canImport: false })
  expect((await t.query(api.resultsImport.list, lottoPage)).page).toEqual([])
  await expect(t.mutation(api.resultsImport.save, { text: row('10/8/2099') })).rejects.toThrow('Sign in')
  for (const claims of [{ issuer: 'https://other.example' }, { admin: true, issuer: 'https://other.example' }]) {
    const user = t.withIdentity({ subject: 'ordinary', ...claims })
    expect(await user.query(api.resultsImport.access, {})).toEqual({ canImport: false })
    await expect(user.mutation(api.resultsImport.save, { text: row('10/8/2099') })).rejects.toThrow('Sign in')
  }
})

test('ordinary verified signed-in users can import and identity is audited but never published', async () => {
  const t = convexTest(schema, modules)
  for (const [index, subject] of ['first', 'second', 'third'].entries()) {
    const user = t.withIdentity({ issuer, subject })
    expect(await user.query(api.resultsImport.access, {})).toEqual({ canImport: true })
    expect(await user.mutation(api.resultsImport.save, { text: row(`10/${8 + index}/2099`) })).toEqual({
      added: 1, skipped: 0, byGame: [{ game: 'lotto', added: 1 }],
    })
  }
  const result = await t.query(api.resultsImport.list, lottoPage)
  expect(result.page).toHaveLength(3)
  expect(result.page[0]).toEqual({
    id: 'lotto:2099-10-10:daily', date: '2099-10-10', time: null,
    numbers: [1, 2, 3, 4, 5, 6], rawNumbers: '01-02-03-04-05-06', jackpotCents: 1_000_000_000, winners: 0,
  })
  const stored = await t.run(ctx => ctx.db.query('historicalResults').withIndex('by_drawId', q => q.eq('drawId', 'lotto:2099-10-10:daily')).unique())
  expect(stored?.importedBy).toBe(`${issuer}|third`)
  expect(typeof stored?.importedAt).toBe('number')
  expect(result.page[0]).not.toHaveProperty('importedBy')
})

test('CSV draw identities and repeated pasted or online rows are skipped without overwriting', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  const fresh = row('10/8/2099')
  const csv = row('9/19/2026', '08-27-06-25-13-22')
  expect(await user.mutation(api.resultsImport.save, { text: `${fresh}\n${fresh}\n${csv}` })).toEqual({
    added: 1, skipped: 2, byGame: [{ game: 'lotto', added: 1 }],
  })
  expect(await user.mutation(api.resultsImport.save, { text: row('10/8/2099', '07-08-09-10-11-12') })).toEqual({ added: 0, skipped: 1, byGame: [] })
  expect((await t.query(api.resultsImport.list, lottoPage)).page[0]!.numbers).toEqual([1, 2, 3, 4, 5, 6])
})

test('guest preview checks CSV and online duplicates and has no write side effects', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  await user.mutation(api.resultsImport.save, { text: row('10/8/2099') })
  const plan = await t.query(api.resultsImport.preview, { text: [
    row('9/19/2026'), row('10/8/2099'), row('10/9/2099'), row('10/9/2099'),
  ].join('\n') })
  expect(plan).toMatchObject({ added: 1, skipped: 3, sourceRows: 4, issues: [], byGame: [{ game: 'lotto', added: 1 }] })
  expect(plan.records).toHaveLength(1)
  expect(plan.records[0]).toMatchObject({ game: 'lotto', line: 3, record: { id: 'lotto:2099-10-09:daily' } })
  expect((await t.query(api.resultsImport.list, lottoPage)).page).toHaveLength(1)
  const invalid = await t.query(api.resultsImport.preview, { text: `${row('10/9/2099')}\n${row('2/30/2099')}` })
  expect(invalid.added).toBe(0)
  expect(invalid.records).toEqual([])
  expect(invalid.issues[0]).toMatchObject({ line: 2 })
})

test('malformed and conflicting batches are atomic and leave no partial additions', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  for (const text of [
    `${row('10/8/2099')}\n${row('2/30/2099')}`,
    `${row('10/8/2099')}\n${row('10/8/2099', '07-08-09-10-11-12')}`,
    `${row('10/8/2099')}\nUnknown Lotto 1-2-3 10/9/2099 100.00 0`,
    `${row('10/8/2099')}\n${row('10/9/2099', '01-01-03-04-05-06')}`,
  ]) {
    await expect(user.mutation(api.resultsImport.save, { text })).rejects.toThrow('Fix all invalid rows')
    expect((await t.query(api.resultsImport.list, lottoPage)).page).toEqual([])
  }
})

test('bounded imports reject oversized UTF-8 input and rows, empty batches write nothing', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  expect(await user.mutation(api.resultsImport.save, { text: ' \n\t' })).toEqual({ added: 0, skipped: 0, byGame: [] })
  await expect(user.mutation(api.resultsImport.save, { text: '₱'.repeat(166_667) })).rejects.toThrow('500 KB')
  await expect(user.mutation(api.resultsImport.save, { text: Array(501).fill(row('10/8/2099')).join('\n') })).rejects.toThrow('500 result rows')
  expect((await t.query(api.resultsImport.list, lottoPage)).page).toEqual([])
})

test('game-scoped pagination preserves native cursors and ordering, excludes audit fields', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  await user.mutation(api.resultsImport.save, { text: [
    row('10/8/2099'), row('10/9/2099'), row('10/10/2099'),
    '3D Lotto 2PM\t0-0-3\t10/10/2099\t4,500.00\t13',
  ].join('\n') })
  const first = await t.query(api.resultsImport.list, { game: 'lotto', paginationOpts: { numItems: 2, cursor: null } })
  expect(first.page.map(item => item.date)).toEqual(['2099-10-10', '2099-10-09'])
  expect(first.isDone).toBe(false)
  const next = await t.query(api.resultsImport.list, { game: 'lotto', paginationOpts: { numItems: 2, cursor: first.continueCursor } })
  expect(next.page.map(item => item.date)).toEqual(['2099-10-08'])
  expect(next.isDone).toBe(true)
  const digits = await t.query(api.resultsImport.list, { game: '3d', paginationOpts: { numItems: 20, cursor: null } })
  expect(digits.page[0]).toMatchObject({ id: '3d:2099-10-10:2PM', numbers: [0, 0, 3], time: '2PM' })
  await expect(t.query(api.resultsImport.list, { game: 'lotto', paginationOpts: { numItems: 501, cursor: null } })).rejects.toThrow('500 results per page')
})

test('overlapping concurrent import requests leave exactly one copy of each draw', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  const responses = await Promise.all([
    user.mutation(api.resultsImport.save, { text: `${row('10/8/2099')}\n${row('10/9/2099')}` }),
    user.mutation(api.resultsImport.save, { text: `${row('10/9/2099')}\n${row('10/10/2099')}` }),
  ])
  expect(responses.reduce((sum, result) => sum + result.added, 0)).toBe(3)
  expect(responses.reduce((sum, result) => sum + result.skipped, 0)).toBe(1)
  expect((await t.query(api.resultsImport.list, lottoPage)).page).toHaveLength(3)
})

test('revision changes for older-date imports and stays stable for skips and other games', async () => {
  const t = convexTest(schema, modules)
  const user = t.withIdentity(identity)
  expect(await t.query(api.resultsImport.revision, { game: 'lotto' })).toBeNull()
  await user.mutation(api.resultsImport.save, { text: row('10/10/2099') })
  const first = await t.query(api.resultsImport.revision, { game: 'lotto' })
  expect(first).not.toBeNull()
  await user.mutation(api.resultsImport.save, { text: row('10/8/2099') })
  const older = await t.query(api.resultsImport.revision, { game: 'lotto' })
  expect(older).not.toBe(first)
  await user.mutation(api.resultsImport.save, { text: row('10/10/2099') })
  await user.mutation(api.resultsImport.save, { text: '3D Lotto 2PM\t0-0-3\t10/10/2099\t4,500.00\t13' })
  expect(await t.query(api.resultsImport.revision, { game: 'lotto' })).toBe(older)
})
