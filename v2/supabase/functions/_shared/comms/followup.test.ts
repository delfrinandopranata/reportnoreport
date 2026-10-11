import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOT_OPENED, followUpCount, isNotOpened } from './followup.ts'

const row = (over = {}) => ({ status: 'sent', opened_at: null, bounced_at: null, complained_at: null, ...over })

test('"not opened" is pinned: sent, never opened, not bounced, not complained', () => {
  assert.deepEqual(NOT_OPENED, [['eq', 'status', 'sent'], ['is', 'opened_at', null], ['is', 'bounced_at', null], ['is', 'complained_at', null]])
  assert.equal(isNotOpened(row()), true)
  for (const over of [{ opened_at: 'x' }, { bounced_at: 'x' }, { complained_at: 'x' }, { status: 'queued' }, { status: 'failed' }]) {
    assert.equal(isNotOpened(row(over)), false)
  }
})

test('the follow-up button shows exactly when the audience is not empty', () => {
  assert.equal(followUpCount({ notOpened: 3 }), 3)
  assert.equal(followUpCount({ notOpened: 0 }), 0)
})
