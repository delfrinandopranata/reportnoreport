import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_STATS, campaignTiles } from './logic.ts'

test('tiles use the same rule', () => {
  const t = campaignTiles({ ...NO_STATS, recipients: 2999, sent: 2999, delivered: 1, opened: 1 }, 'email')
  assert.deepEqual(t.slice(1, 3).map((x) => x.value), ['<1%', '100%'])
  assert.equal(campaignTiles({ ...NO_STATS, recipients: 2000, opened: 1 }, 'in_app')[1].value, '<1%')
})
