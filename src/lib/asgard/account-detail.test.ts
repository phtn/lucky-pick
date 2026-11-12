import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatLedgerAmount, formatLedgerLabel, formatWalletAvailable, topupDisplayStatus } from './account-detail'

describe('Ledger amounts', () => {
  test('carries the sign, because a float row reads as a movement', () => {
    assert.equal(formatLedgerAmount(50_000), '+50,000')
    assert.equal(formatLedgerAmount(-25_000), '−25,000')
  })

  test('writes zero without a sign', () => {
    assert.equal(formatLedgerAmount(0), '0')
  })
})

describe('Ledger labels', () => {
  test('prefers the transaction memo, which is what an operator wrote', () => {
    assert.equal(formatLedgerLabel({ kind: 'mint', memo: 'Opening grant' }), 'Opening grant')
  })

  test('names the kind when there is no memo', () => {
    assert.equal(formatLedgerLabel({ kind: 'mint', memo: null }), 'Mint')
    assert.equal(formatLedgerLabel({ kind: 'ticketHold', memo: null }), 'Ticket hold')
    assert.equal(formatLedgerLabel({ kind: 'payoutSettle', memo: null }), 'Payout settled')
  })

  test('does not let a blank memo leave the row unlabelled', () => {
    assert.equal(formatLedgerLabel({ kind: 'migration', memo: '   ' }), 'Migration')
  })
})

describe('Wallet balances', () => {
  test('reads a wallet it has as a grouped number', () => {
    assert.equal(formatWalletAvailable({ available: 75_300 }), '75,300')
  })

  test('reads a wallet that does not exist as an em dash, not as zero', () => {
    // A missing wallet and an empty one are different facts, and an account
    // page that shows 0 for both hides one of them.
    assert.equal(formatWalletAvailable(null), '—')
  })
})

describe('Top-up status as shown', () => {
  test('an approved top-up that has not minted is still waiting on its claim', () => {
    assert.equal(topupDisplayStatus({ status: 'approved', txnId: null }), 'approved')
  })

  test('one approved before claiming existed already minted, so it reads as claimed', () => {
    assert.equal(topupDisplayStatus({ status: 'approved', txnId: 'txn1' }), 'claimed')
  })

  test('every other status reads as itself', () => {
    assert.equal(topupDisplayStatus({ status: 'pending', txnId: null }), 'pending')
    assert.equal(topupDisplayStatus({ status: 'claimed', txnId: 'txn1' }), 'claimed')
    assert.equal(topupDisplayStatus({ status: 'rejected', txnId: null }), 'rejected')
  })
})
