import { v } from 'convex/values'
import { GAME_IDS } from '../../src/lib/games'
import { query } from '../_generated/server'
import { betTypeConfigSchema, gameIdSchema, pickPayoutSchema, secondaryPrizesSchema } from './d'
import { requireStaffIdentity } from './helpers'

/** The game grid as the app reads it: no operator trail, since a player sees it. */
const publicGameSchema = v.object({
  gameId: gameIdSchema,
  name: v.string(),
  pool: v.number(),
  enabled: v.boolean(),
  order: v.number(),
  baseJackpot: v.number(),
  rollover: v.number(),
  drawDays: v.array(v.number()),
  drawDayLabel: v.string(),
  secondary: secondaryPrizesSchema,
  payout: pickPayoutSchema,
  accent: v.string(),
  betTypes: v.array(betTypeConfigSchema)
})

/** The same grid plus who last changed it and when, which the console shows. */
const consoleGameSchema = v.object({
  ...publicGameSchema.fields,
  gameRowId: v.id('games'),
  updatedAt: v.number(),
  updatedBy: v.string()
})

/**
 * Every configured game, in rail order.
 *
 * Open on purpose: these are the prices and the bet types on sale, which the
 * app has to know before anyone signs in. A table that has never been seeded
 * answers with nothing, and the client falls back to the static config in
 * `src/lib/games.ts` — the behaviour the app had before this table existed.
 */
export const list = query({
  args: {},
  returns: v.array(publicGameSchema),
  handler: async (ctx) => {
    const rows = await ctx.db.query('games').take(GAME_IDS.length)

    return rows
      .map((row) => ({
        gameId: row.gameId,
        name: row.name,
        pool: row.pool,
        enabled: row.enabled,
        order: row.order,
        baseJackpot: row.baseJackpot,
        rollover: row.rollover,
        drawDays: row.drawDays,
        drawDayLabel: row.drawDayLabel,
        secondary: row.secondary,
        payout: row.payout,
        accent: row.accent,
        betTypes: row.betTypes
      }))
      .sort((a, b) => a.order - b.order)
  }
})

/** The console's read: the same rows, with the operator trail attached. */
export const listForAsgard = query({
  args: {},
  returns: v.array(consoleGameSchema),
  handler: async (ctx) => {
    await requireStaffIdentity(ctx)

    const rows = await ctx.db.query('games').take(GAME_IDS.length)

    return rows
      .map((row) => ({
        gameRowId: row._id,
        gameId: row.gameId,
        name: row.name,
        pool: row.pool,
        enabled: row.enabled,
        order: row.order,
        baseJackpot: row.baseJackpot,
        rollover: row.rollover,
        drawDays: row.drawDays,
        drawDayLabel: row.drawDayLabel,
        secondary: row.secondary,
        payout: row.payout,
        accent: row.accent,
        betTypes: row.betTypes,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy
      }))
      .sort((a, b) => a.order - b.order)
  }
})
