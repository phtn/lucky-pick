import { paginationOptsValidator, paginationResultValidator, type UserIdentity } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { parseRawResults } from '../src/lib/results-import'
import type { LotteryResult, ResultGameId } from '../src/lib/results'
import { mutation, query, type QueryCtx } from './_generated/server'
import { CSV_DRAW_IDS } from './csvBaseline'
import { publicResult, resultGame } from './resultValidators'

const csvDrawIds = new Set(CSV_DRAW_IDS)
const FIREBASE_ISSUER = 'https://securetoken.google.com/lucky-pick-345'

function canImport(identity: UserIdentity | null): identity is UserIdentity {
  return identity !== null && identity.issuer === FIREBASE_ISSUER
    && typeof identity.subject === 'string' && identity.subject.trim().length > 0
}

const importPlan = v.object({
  added: v.number(), skipped: v.number(), sourceRows: v.number(),
  byGame: v.array(v.object({ game: resultGame, added: v.number() })),
  issues: v.array(v.object({ line: v.number(), message: v.string() })),
  records: v.array(v.object({ game: resultGame, record: publicResult, line: v.number() })),
})

async function planImport(ctx: QueryCtx, text: string) {
  let parsed: ReturnType<typeof parseRawResults>
  try {
    parsed = parseRawResults(text)
  } catch (error) {
    return {
      added: 0, skipped: 0, sourceRows: 0, byGame: [], records: [],
      issues: [{ line: 1, message: error instanceof Error ? error.message : 'Could not parse the pasted results.' }],
    }
  }
  if (parsed.issues.length) {
    return { added: 0, skipped: parsed.duplicateRows, sourceRows: parsed.sourceRows, byGame: [], records: [], issues: parsed.issues }
  }
  let skipped = parsed.duplicateRows
  const records: typeof parsed.records = []
  const counts = new Map<ResultGameId, number>()
  for (const item of parsed.records) {
    if (csvDrawIds.has(item.record.id)) {
      skipped++
      continue
    }
    const existing = await ctx.db.query('historicalResults')
      .withIndex('by_drawId', q => q.eq('drawId', item.record.id))
      .unique()
    if (existing) {
      skipped++
      continue
    }
    records.push(item)
    counts.set(item.game, (counts.get(item.game) ?? 0) + 1)
  }
  return {
    added: records.length, skipped, sourceRows: parsed.sourceRows, records, issues: [],
    byGame: [...counts].map(([game, added]) => ({ game, added })),
  }
}

export const access = query({
  args: {},
  returns: v.object({ canImport: v.boolean() }),
  handler: async ctx => ({ canImport: canImport(await ctx.auth.getUserIdentity()) }),
})

export const preview = query({
  args: { text: v.string() },
  returns: importPlan,
  handler: (ctx, args) => planImport(ctx, args.text),
})

// Creation order changes even when an imported draw has an older draw date.
// Watching this bounded query lets clients refresh their paginated history.
export const revision = query({
  args: { game: resultGame },
  returns: v.union(v.id('historicalResults'), v.null()),
  handler: async (ctx, args) => {
    const latest = await ctx.db.query('historicalResults')
      .withIndex('by_game', q => q.eq('game', args.game))
      .order('desc')
      .first()
    return latest?._id ?? null
  },
})

export const list = query({
  args: { game: resultGame, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(publicResult),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 500) {
      throw new ConvexError('Request between 1 and 500 results per page.')
    }
    const results = await ctx.db.query('historicalResults')
      .withIndex('by_game_and_date', q => q.eq('game', args.game))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...results,
      page: results.page.map(({ drawId, date, time, numbers, rawNumbers, jackpotCents, winners }): LotteryResult => ({
        id: drawId, date, time, numbers, rawNumbers, jackpotCents, winners,
      })),
    }
  },
})

export const save = mutation({
  args: { text: v.string() },
  returns: v.object({
    added: v.number(),
    skipped: v.number(),
    byGame: v.array(v.object({ game: resultGame, added: v.number() })),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!canImport(identity)) throw new ConvexError('Sign in to import shared results.')
    const plan = await planImport(ctx, args.text)
    if (plan.issues.length) {
      const first = plan.issues[0]!
      throw new ConvexError(`Line ${first.line}: ${first.message} Fix all invalid rows before importing.`)
    }
    const importedAt = Date.now()
    // Each indexed read participates in this transaction. Concurrent imports
    // conflict and retry rather than inserting the same draw twice.
    for (const { game, record } of plan.records) {
      const { id, ...fields } = record
      await ctx.db.insert('historicalResults', {
        drawId: id, game, ...fields, importedBy: identity.tokenIdentifier, importedAt,
      })
    }
    return { added: plan.added, skipped: plan.skipped, byGame: plan.byGame }
  },
})
