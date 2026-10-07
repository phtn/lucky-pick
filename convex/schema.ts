import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { resultFields, resultGame } from './resultValidators'

export default defineSchema({
  historicalResults: defineTable({
    drawId: v.string(),
    game: resultGame,
    ...resultFields,
    importedBy: v.string(),
    importedAt: v.number(),
  })
    .index('by_drawId', ['drawId'])
    .index('by_game', ['game'])
    .index('by_game_and_date', ['game', 'date']),
})
