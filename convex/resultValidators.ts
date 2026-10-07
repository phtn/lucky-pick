import { v } from 'convex/values'

export const resultGame = v.union(
  v.literal('lotto'), v.literal('mega'), v.literal('super'), v.literal('grand'),
  v.literal('ultra'), v.literal('2d'), v.literal('3d'), v.literal('4d'), v.literal('6d'),
)

export const resultFields = {
  date: v.string(),
  time: v.union(v.literal('2PM'), v.literal('5PM'), v.literal('9PM'), v.null()),
  numbers: v.union(v.array(v.number()), v.null()),
  rawNumbers: v.union(v.string(), v.null()),
  jackpotCents: v.number(),
  winners: v.union(v.number(), v.null()),
}

export const publicResult = v.object({ id: v.string(), ...resultFields })
