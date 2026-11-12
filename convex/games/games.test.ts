/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { GAME_IDS } from '../../src/lib/games'
import { api } from '../_generated/api'
import { god, member, staff } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const makeT = () => convexTest(schema, modules)

test('seed writes one row per game and never resets a configured one', async () => {
  const t = makeT()
  const asGod = t.withIdentity(god)

  expect(await asGod.mutation(api.games.m.seed, {})).toEqual({ created: GAME_IDS.length })
  await asGod.mutation(api.games.m.updateBetType, { gameId: '6/42', betType: 3, ticketCost: 40 })

  // Seeding again finds every game already there, so the price stands.
  expect(await asGod.mutation(api.games.m.seed, {})).toEqual({ created: 0 })

  const games = await t.query(api.games.q.list, {})
  expect(games.map((game) => game.gameId)).toEqual(GAME_IDS)
  expect(games.find((game) => game.gameId === '6/42')?.betTypes.find((bet) => bet.betType === 3)?.ticketCost).toBe(40)
})

test('list is open, so the board has prices before anyone signs in', async () => {
  const t = makeT()
  await t.withIdentity(god).mutation(api.games.m.seed, {})

  const games = await t.query(api.games.q.list, {})
  expect(games).toHaveLength(GAME_IDS.length)
  // The operator trail is not part of what a player reads.
  expect(games[0]).not.toHaveProperty('updatedBy')
})

test('a never-seeded table answers with nothing rather than inventing rows', async () => {
  const t = makeT()
  expect(await t.query(api.games.q.list, {})).toEqual([])
})

test('editing a game writes the row a never-seeded table is missing', async () => {
  const t = makeT()
  const asGod = t.withIdentity(god)

  await asGod.mutation(api.games.m.setGameEnabled, { gameId: '6/49', enabled: false })

  const games = await t.query(api.games.q.list, {})
  expect(games.map((game) => game.gameId)).toEqual(['6/49'])
  expect(games[0].enabled).toBe(false)
  // The rest of the row is the static config, and all six bet types are present.
  expect(games[0].pool).toBe(49)
  expect(games[0].betTypes.map((bet) => bet.betType)).toEqual([1, 2, 3, 4, 5, 6])
})

test('a bet type can be closed without touching its price', async () => {
  const t = makeT()
  const asGod = t.withIdentity(god)

  await asGod.mutation(api.games.m.updateBetType, { gameId: '6/45', betType: 2, ticketCost: 30 })
  await asGod.mutation(api.games.m.updateBetType, { gameId: '6/45', betType: 2, enabled: false })

  const bet = (await t.query(api.games.q.list, {}))[0].betTypes.find((cell) => cell.betType === 2)
  expect(bet).toMatchObject({ enabled: false, ticketCost: 30 })
  // Setting the price reset the stakes to its multiples; closing left them alone.
  expect(bet?.stakes).toEqual([30, 60, 90, 120])
})

test('stakes are stored ascending, de-duplicated, and always hold the ticket cost', async () => {
  const t = makeT()
  await t
    .withIdentity(god)
    .mutation(api.games.m.updateBetType, { gameId: '6/58', betType: 6, ticketCost: 50, stakes: [100, 20, 20] })

  const bet = (await t.query(api.games.q.list, {}))[0].betTypes.find((cell) => cell.betType === 6)
  expect(bet?.stakes).toEqual([20, 50, 100])
})

test('stakes set by hand survive until the price next changes', async () => {
  const t = makeT()
  const asGod = t.withIdentity(god)
  const read = async () => (await t.query(api.games.q.list, {}))[0].betTypes.find((cell) => cell.betType === 3)

  await asGod.mutation(api.games.m.updateBetType, { gameId: '6/49', betType: 3, ticketCost: 30 })
  await asGod.mutation(api.games.m.updateBetType, { gameId: '6/49', betType: 3, stakes: [30, 45] })
  expect((await read())?.stakes).toEqual([30, 45])

  await asGod.mutation(api.games.m.updateBetType, { gameId: '6/49', betType: 3, ticketCost: 50 })
  expect((await read())?.stakes).toEqual([50, 100, 150, 200])
})

test('a price that is not whole pesos, or out of range, is refused', async () => {
  const t = makeT()
  const asGod = t.withIdentity(god)

  await expect(
    asGod.mutation(api.games.m.updateBetType, { gameId: '6/42', betType: 1, ticketCost: 20.5 })
  ).rejects.toThrow()
  await expect(asGod.mutation(api.games.m.updateBetType, { gameId: '6/42', betType: 1, ticketCost: 0 })).rejects.toThrow()
  await expect(
    asGod.mutation(api.games.m.updateBetType, { gameId: '6/42', betType: 1, stakes: [25, 0] })
  ).rejects.toThrow()

  // None of the refusals left a row behind.
  expect(await t.query(api.games.q.list, {})).toEqual([])
})

test('a call that changes nothing is refused', async () => {
  const t = makeT()
  await expect(
    t.withIdentity(god).mutation(api.games.m.updateBetType, { gameId: '6/42', betType: 1 })
  ).rejects.toThrow()
})

test('only a god may change the grid, and only staff may read the console view', async () => {
  const t = makeT()
  const ana = member('ana', 'ana@example.com')

  await expect(t.mutation(api.games.m.seed, {})).rejects.toThrow()
  await expect(t.withIdentity(staff).mutation(api.games.m.seed, {})).rejects.toThrow()
  await expect(
    t.withIdentity(ana).mutation(api.games.m.setGameEnabled, { gameId: '6/42', enabled: false })
  ).rejects.toThrow()

  await expect(t.withIdentity(ana).query(api.games.q.listForAsgard, {})).rejects.toThrow()
  // An admin reads the console; a god wrote the rows.
  await t.withIdentity(god).mutation(api.games.m.seed, {})
  expect(await t.withIdentity(staff).query(api.games.q.listForAsgard, {})).toHaveLength(GAME_IDS.length)
})

test('the grid comes back in rail order whatever order it was written in', async () => {
  const t = makeT()
  const asGod = t.withIdentity(god)

  await asGod.mutation(api.games.m.setGameEnabled, { gameId: '6/58', enabled: true })
  await asGod.mutation(api.games.m.setGameEnabled, { gameId: '6/42', enabled: true })

  expect((await t.query(api.games.q.list, {})).map((game) => game.gameId)).toEqual(['6/42', '6/58'])
})
