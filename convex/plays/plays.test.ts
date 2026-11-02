/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { FunctionArgs } from 'convex/server'
import { member } from '../lib/testIdentities'
import schema from '../schema'
import { DEFAULT_PLAY_PAGE, PLAY_HISTORY_LIMIT, TICKET_DETAIL_LIMIT } from './d'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

type RecordArgs = FunctionArgs<typeof api.plays.m.record>

const ana = member('ana', 'ana@example.com')
const ben = member('ben', 'ben@example.com')

const ticket = (n: number) => ({
  numbers: [1, 2, 3, 4, 5, n],
  betType: 6 as const,
  cost: 20,
  hits: 0,
  prize: 0,
  playerName: 'Ana'
})

/** A valid `record` payload for one ticket; override only what a test is about. */
const play = (overrides: Partial<RecordArgs> = {}): RecordArgs => ({
  game: '6/42',
  mode: 'solo',
  isOfficial: false,
  drawnBalls: [1, 2, 3, 4, 5, 6],
  seed: { clientSeed: 'c', serverSeed: 's', nonce: 1, rolls: 6 },
  ticketCount: 1,
  spent: 20,
  won: 0,
  winCount: 0,
  bestHits: 0,
  tickets: [ticket(7)],
  drawnAt: 1_000,
  ...overrides
})

const setup = async () => {
  const t = convexTest(schema, modules)
  const asAna = t.withIdentity(ana)
  const asBen = t.withIdentity(ben)
  await asAna.mutation(api.users.m.ensureCurrent, {})
  await asBen.mutation(api.users.m.ensureCurrent, {})
  return { t, asAna, asBen }
}

test('record refuses a signed-out caller and returns null', async () => {
  const { t } = await setup()
  expect(await t.mutation(api.plays.m.record, play())).toBe(null)
  expect(await t.run((ctx) => ctx.db.query('practicePlays').collect())).toEqual([])
})

test('record owns the row by identity, not by any client-supplied id', async () => {
  const { t, asAna } = await setup()
  const anaUser = await asAna.query(api.users.q.current, {})
  // A client-supplied userId is not part of the contract; the validator rejects it.
  await expect(
    asAna.mutation(api.plays.m.record, { ...play(), userId: 'someone-else' } as never)
  ).rejects.toThrow()

  const id = await asAna.mutation(api.plays.m.record, play())
  expect(id).not.toBe(null)
  const rows = await t.run((ctx) => ctx.db.query('practicePlays').collect())
  expect(rows).toHaveLength(1)
  expect(rows[0].userId).toBe(anaUser?._id)
})

test('record truncates a ticket detail array longer than the cap', async () => {
  const { t, asAna } = await setup()
  const tickets = Array.from({ length: 90 }, (_, i) => ticket(i + 7))
  await asAna.mutation(api.plays.m.record, play({ tickets, ticketCount: 90, spent: 1800 }))

  const [row] = await t.run((ctx) => ctx.db.query('practicePlays').collect())
  expect(row.tickets).toHaveLength(TICKET_DETAIL_LIMIT)
  expect(row.tickets.map((x) => x.numbers[5])).toEqual(tickets.slice(0, TICKET_DETAIL_LIMIT).map((x) => x.numbers[5]))
  expect(row.ticketCount).toBe(90)
  expect(row.spent).toBe(1800)
})

test('record prunes to the newest 200 rows per user', async () => {
  const { t, asAna } = await setup()
  for (let i = 0; i <= PLAY_HISTORY_LIMIT; i++) {
    await asAna.mutation(api.plays.m.record, play({ drawnAt: 1_000 + i }))
  }

  const rows = await t.run((ctx) => ctx.db.query('practicePlays').collect())
  expect(rows).toHaveLength(PLAY_HISTORY_LIMIT)
  const drawnAts = rows.map((r) => r.drawnAt)
  expect(drawnAts).not.toContain(1_000)
  expect(Math.min(...drawnAts)).toBe(1_001)
  expect(Math.max(...drawnAts)).toBe(1_000 + PLAY_HISTORY_LIMIT)
})

test("record keeps one user's pruning off another user's rows", async () => {
  const { t, asAna, asBen } = await setup()
  for (let i = 0; i < 3; i++) await asBen.mutation(api.plays.m.record, play({ drawnAt: 500 + i }))
  for (let i = 0; i <= PLAY_HISTORY_LIMIT; i++) {
    await asAna.mutation(api.plays.m.record, play({ drawnAt: 1_000 + i }))
  }

  const benUser = await asBen.query(api.users.q.current, {})
  const benRows = await t.run((ctx) =>
    ctx.db
      .query('practicePlays')
      .withIndex('by_userId_and_drawnAt', (q) => q.eq('userId', benUser!._id))
      .collect()
  )
  expect(benRows).toHaveLength(3)
  const all = await t.run((ctx) => ctx.db.query('practicePlays').collect())
  expect(all).toHaveLength(PLAY_HISTORY_LIMIT + 3)
})

test("mine returns a user's own rows newest first", async () => {
  const { asAna } = await setup()
  for (const drawnAt of [300, 100, 200]) await asAna.mutation(api.plays.m.record, play({ drawnAt }))

  const rows = await asAna.query(api.plays.q.mine, {})
  expect(rows.map((r) => r.drawnAt)).toEqual([300, 200, 100])
})

test('mine returns an empty array when signed out or with no plays', async () => {
  const { t, asAna } = await setup()
  expect(await t.query(api.plays.q.mine, {})).toEqual([])
  expect(await asAna.query(api.plays.q.mine, {})).toEqual([])
})

test("mine never returns another user's rows", async () => {
  const { asAna, asBen } = await setup()
  await asAna.mutation(api.plays.m.record, play({ drawnAt: 100 }))
  await asAna.mutation(api.plays.m.record, play({ drawnAt: 200 }))

  expect(await asBen.query(api.plays.q.mine, {})).toEqual([])
  expect(await asAna.query(api.plays.q.mine, {})).toHaveLength(2)
})

test('mine clamps limit to the page bounds', async () => {
  const { t, asAna } = await setup()
  const user = await asAna.query(api.users.q.current, {})
  // Seed past the page size and the history cap directly, rather than through 250 mutations.
  await t.run(async (ctx) => {
    for (let i = 0; i < PLAY_HISTORY_LIMIT + 20; i++) {
      await ctx.db.insert('practicePlays', { ...play({ drawnAt: i }), userId: user!._id })
    }
  })

  expect(await asAna.query(api.plays.q.mine, {})).toHaveLength(DEFAULT_PLAY_PAGE)
  expect(await asAna.query(api.plays.q.mine, { limit: 0 })).toHaveLength(DEFAULT_PLAY_PAGE)
  expect(await asAna.query(api.plays.q.mine, { limit: -5 })).toHaveLength(DEFAULT_PLAY_PAGE)
  expect(await asAna.query(api.plays.q.mine, { limit: 7 })).toHaveLength(7)
  expect(await asAna.query(api.plays.q.mine, { limit: 10_000 })).toHaveLength(PLAY_HISTORY_LIMIT)
})

test('mine orders same-millisecond draws stably, newest first', async () => {
  const { asAna } = await setup()
  // Same drawnAt, told apart by ticketCount; creation order is 1, 2, 3.
  for (const ticketCount of [1, 2, 3]) {
    await asAna.mutation(api.plays.m.record, play({ drawnAt: 5_000, ticketCount }))
  }

  const first = await asAna.query(api.plays.q.mine, {})
  const second = await asAna.query(api.plays.q.mine, {})
  expect(first.map((r) => r.ticketCount)).toEqual([3, 2, 1])
  expect(second.map((r) => r._id)).toEqual(first.map((r) => r._id))
})
