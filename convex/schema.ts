import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { accountSchema } from './accounts/d'
import { creditsFields } from './credits/d'
import { gameFields } from './games/d'
import { ledgerEntryFields, ledgerTransactionFields, walletFields } from './ledger/d'
import { topupPolicyChangeFields, topupPolicyFields, topupRequestFields } from './money/d'
import { notificationFields } from './notifications/d'
import { practicePlayFields } from './plays/d'
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
  // One row per game, seeded from `src/lib/games.ts`. `by_gameId` is the row's
  // identity: the console and the app both look a game up by the id they use.
  games: defineTable(gameFields).index('by_gameId', ['gameId']).index('by_order', ['order']),
  credits: defineTable(creditsFields)
    .index('by_accountId', ['accountId'])
    .index('by_accountId_and_userId', ['accountId', 'userId'])
    .index('by_userId', ['userId'])
    .index('by_accountSlug_and_userTokenIdentifier', ['accountSlug', 'userTokenIdentifier']),
  users: defineTable(userDocumentValidator)
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_firebaseUid', ['firebaseUid'])
    .index('by_email', ['email']),
  wallets: defineTable(walletFields)
    .index('by_accountId_and_kind', ['accountId', 'kind'])
    .index('by_accountId_and_userId', ['accountId', 'userId'])
    .index('by_userId', ['userId'])
    .index('by_systemKey', ['systemKey']),
  ledgerTransactions: defineTable(ledgerTransactionFields)
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_accountId_and_createdAt', ['accountId', 'createdAt'])
    .index('by_reversesTxnId', ['reversesTxnId']),
  ledgerEntries: defineTable(ledgerEntryFields)
    .index('by_walletId_and_createdAt', ['walletId', 'createdAt'])
    .index('by_txnId', ['txnId']),
  topupRequests: defineTable(topupRequestFields)
    .index('by_status_and_createdAt', ['status', 'createdAt'])
    .index('by_accountId_and_createdAt', ['accountId', 'createdAt']),
  // A single row; see `topupPolicyFields`.
  topupPolicy: defineTable(topupPolicyFields),
  topupPolicyChanges: defineTable(topupPolicyChangeFields),
  practicePlays: defineTable(practicePlayFields).index('by_userId_and_drawnAt', ['userId', 'drawnAt']),
  notifications: defineTable(notificationFields).index('by_userId_and_createdAt', ['userId', 'createdAt']),
})
