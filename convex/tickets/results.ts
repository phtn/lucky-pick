import type { Doc } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { RESULT_GAME_IDS } from './d'

/** The official result used to settle a game's tickets for this Manila draw date. */
export async function findDrawResult(ctx: Pick<QueryCtx, 'db'>, game: Doc<'tickets'>['game'], drawDate: string) {
  const resultGame = (Object.entries(RESULT_GAME_IDS) as [keyof typeof RESULT_GAME_IDS, Doc<'tickets'>['game']][])
    .find(([, ticketGame]) => ticketGame === game)?.[0]
  if (!resultGame) return null
  return await ctx.db
    .query('historicalResults')
    .withIndex('by_game_and_date', (q) => q.eq('game', resultGame).eq('date', drawDate))
    .first()
}
