import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSetPasswordFlow, validateNewPassword } from './password.ts'

test('a new password needs 8 characters and a matching confirmation', () => {
  assert.equal(validateNewPassword('longenough', 'longenough'), null)
  assert.equal(validateNewPassword('short', 'short'), 'Enter at least 8 characters.')
  assert.equal(validateNewPassword('', ''), 'Enter at least 8 characters.')
  assert.equal(validateNewPassword('longenough', 'longenougH'), 'The two passwords do not match.')
  assert.equal(validateNewPassword('longenough', ''), 'The two passwords do not match.')
})

test('the set-password screen is reached only by ?flow=set-password', () => {
  assert.ok(isSetPasswordFlow('?flow=set-password'))
  assert.ok(isSetPasswordFlow('?a=1&flow=set-password'))
  assert.ok(!isSetPasswordFlow(''))
  assert.ok(!isSetPasswordFlow('?flow=other'))
})
