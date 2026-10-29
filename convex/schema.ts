import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { accountSchema } from './accounts/d'
import { creditsFields } from './credits/d'
import { resultFields, resultGame } from './resultValidators'
import { userDocumentValidator } from './users/v'

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
  accounts: defineTable(accountSchema)
    .index('by_slug', ['slug'])
    .index('by_createdAt', ['createdAt'])
    .index('by_status_and_createdAt', ['status', 'createdAt'])
    .index('by_ownerTokenIdentifier_and_createdAt', ['ownerTokenIdentifier', 'createdAt'])
    .index('by_primaryContact_tokenIdentifier', ['primaryContact.tokenIdentifier'])
    .index('by_primaryContact_email', ['primaryContact.email'])
    .index('by_primaryContact_firebaseUid', ['primaryContact.firebaseUid']),
  credits: defineTable(creditsFields)
    .index('by_accountId', ['accountId'])
    .index('by_accountId_and_userId', ['accountId', 'userId'])
    .index('by_userId', ['userId'])
    .index('by_accountSlug_and_userTokenIdentifier', ['accountSlug', 'userTokenIdentifier']),
  users: defineTable(userDocumentValidator)
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_firebaseUid', ['firebaseUid'])
    .index('by_email', ['email']),
})
