import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_STATS, campaignTiles, pct, pctText } from './logic.ts'

test('a non-zero share never reads 0% and a not-quite-all share never reads 100%', () => {
  assert.equal(pctText(pct(1, 2999)), '<1%')
  assert.equal(pctText(pct(2998, 2999)), '>99%')
  assert.equal(pctText(pct(0, 5)), '0%')
  assert.equal(pctText(pct(5, 5)), '100%')
  assert.equal(pctText(pct(1, 3)), '33.3%')
  assert.equal(pctText(pct(5, 0)), 'No data yet')
  assert.equal(pctText(pct(2, 2000)), '<1%')
  assert.equal(pctText(pct(5, 1000)), '<1%')
  assert.equal(pctText(pct(995, 1000)), '>99%')
  assert.equal(pctText(pct(10, 1000)), '1%')
})

test('tiles use the same rule', () => {
  const t = campaignTiles({ ...NO_STATS, recipients: 2999, sent: 2999, delivered: 1, opened: 1 }, 'email')
  assert.deepEqual(t.slice(1, 3).map((x) => x.value), ['<1%', '100%'])
  assert.equal(campaignTiles({ ...NO_STATS, recipients: 2000, opened: 1 }, 'in_app')[1].value, '<1%')
})
