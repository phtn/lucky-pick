import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readEnvValue } from './env-secret'

describe('env secret reading', () => {
  // The bug this guards: a Firebase web API key pushed with `wrangler secret
  // put` straight from an env line arrives as `"AIza…"`. Identity Toolkit
  // answers `API key not valid`, and `.dev.vars` hides it by stripping quotes
  // in dev, so the deployed Worker is the only place it shows.
  test('strips the double quotes an env line wraps a value in', () => {
    assert.equal(readEnvValue('"AIzaSyExampleKeyValue"'), 'AIzaSyExampleKeyValue')
  })

  test('strips single quotes too', () => {
    assert.equal(readEnvValue("'https://example.convex.cloud'"), 'https://example.convex.cloud')
  })

  test('leaves an unquoted value alone', () => {
    assert.equal(readEnvValue('AIzaSyExampleKeyValue'), 'AIzaSyExampleKeyValue')
  })

  test('keeps quotes that are not a matching surrounding pair', () => {
    assert.equal(readEnvValue('"mismatched'), '"mismatched')
    assert.equal(readEnvValue('say "this" here'), 'say "this" here')
  })

  test('treats missing, blank and empty-quoted values as absent', () => {
    assert.equal(readEnvValue(undefined), undefined)
    assert.equal(readEnvValue('   '), undefined)
    assert.equal(readEnvValue('""'), undefined)
  })

  test('trims the whitespace around a value and inside its quotes', () => {
    assert.equal(readEnvValue('  AIzaSyExampleKeyValue  '), 'AIzaSyExampleKeyValue')
    assert.equal(readEnvValue('" AIzaSyExampleKeyValue "'), 'AIzaSyExampleKeyValue')
  })
})
