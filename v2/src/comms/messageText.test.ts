import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attemptsText, problemHint, resultText } from './messageText.ts'

test('attempts: nothing before the first try, "once" and "n times" after; a first-try success says nothing', () => {
  assert.equal(attemptsText({ status: 'queued', attempts: 0 }), null)
  assert.equal(attemptsText({ status: 'failed', attempts: 1 }), 'Tried once')
  assert.equal(attemptsText({ status: 'queued', attempts: 2 }), 'Tried 2 times')
  assert.equal(attemptsText({ status: 'sent', attempts: 1 }), null)
  assert.equal(attemptsText({ status: 'sent', attempts: 3 }), 'Tried 3 times')
})
test('a problem says what happens next: failed waits for Retry, queued tries again, nothing otherwise', () => {
  assert.equal(problemHint({ status: 'failed', error: 'x' }), 'Fix the cause, then press Retry.')
  assert.equal(problemHint({ status: 'queued', error: 'x' }), 'Will try again automatically.')
  assert.equal(problemHint({ status: 'queued', error: null }), null)
  assert.equal(problemHint({ status: 'sent', error: 'old' }), null)
})
test('the result line counts the rows the filter shows', () => {
  assert.equal(resultText('failed', 3), 'Showing 3 failed messages.')
  assert.equal(resultText('failed', 1), 'Showing 1 failed message.')
  assert.equal(resultText('failed', 0), 'No failed messages.')
  assert.equal(resultText('all', 2), 'Showing 2 messages.')
  assert.equal(resultText('all', 0), 'No messages.')
})
