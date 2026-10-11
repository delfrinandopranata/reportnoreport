import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastPage, messageOps, pageRange, pageText } from './messageQuery.ts'

test('source and status filters combine', () => {
  assert.deepEqual(messageOps('system', 'failed'), [['is', 'campaign_id', null], ['eq', 'status', 'failed']])
  assert.deepEqual(messageOps('campaign', 'queued'), [['notnull', 'campaign_id', null], ['eq', 'status', 'queued']])
  assert.deepEqual(messageOps('all', 'all'), [])
  assert.deepEqual(messageOps('system', 'all'), [['is', 'campaign_id', null]])
})

test('paging uses exact totals', () => {
  assert.deepEqual(pageRange(1), [0, 49])
  assert.deepEqual(pageRange(3), [100, 149])
  assert.equal(lastPage(0), 1)
  assert.equal(lastPage(13_001), 261)
  assert.equal(pageText(2, 13_001), 'Showing 51–100 of 13,001')
  assert.equal(pageText(261, 13_001), 'Showing 13,001–13,001 of 13,001')
  assert.equal(pageText(1, 0), 'No messages')
})
