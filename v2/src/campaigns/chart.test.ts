import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countTicks, dailyGeometry, dailySummary, dayTipBox, emptyChartText, polyline } from './chart.ts'

const days = (opens: number[], clicks: number[]) => opens.map((o, i) => ({ day: i, opens: o, clicks: clicks[i] ?? 0 }))

test('seven days spread across the width with a zero baseline', () => {
  const g = dailyGeometry(days([10, 4, 2, 0, 0, 0, 1], [5, 1]), 400, 200)
  assert.deepEqual([g.xs[0], g.xs[6], g.bottom], [40, 388, 176])
  assert.deepEqual(g.ticks.map((t) => t.value), [0, 5, 10])
  assert.deepEqual([g.ticks[0].y, g.opens[0].y, g.clicks[0].y], [176, 8, 92])
  assert.equal(polyline(g.opens.slice(0, 2)), '40.0,8.0 98.0,108.8')
})

test('counts get whole-number ticks, never 0.25 of an open', () => {
  assert.deepEqual(countTicks(0), [0, 1])
  assert.deepEqual(countTicks(1), [0, 1])
  assert.deepEqual(countTicks(3), [0, 1, 2, 3])
  assert.deepEqual(countTicks(12), [0, 5, 10, 15])
  assert.deepEqual(countTicks(10_000), [0, 5_000, 10_000])
})

test('the left margin grows to fit the widest tick label', () => {
  const g = dailyGeometry(days([10_000, 0, 0, 0, 0, 0, 0], []), 400, 200)
  assert.equal(g.left, Math.ceil('10,000'.length * 6.5 + 12))
  assert.equal(g.xs[0], g.left)
})

test('nothing opened draws flat lines on the baseline without dividing by zero', () => {
  const g = dailyGeometry(days([0, 0, 0, 0, 0, 0, 0], []), 320, 160)
  assert.deepEqual(g.ticks.map((t) => t.value), [0, 1])
  assert.ok([...g.opens, ...g.clicks].every((p) => p.y === g.bottom && Number.isFinite(p.x)))
})

test('the summary names the totals and the busiest day, for email and in-app', () => {
  assert.equal(dailySummary(days([3, 9, 0, 0, 0, 0, 0], [1]), false), 'Opens and clicks over the first 7 days: 12 opens and 1 click, most opens on day 2.')
  assert.equal(dailySummary(days([3, 0, 0, 0, 0, 0, 0], []), true), 'Reads over the first 7 days: 3 reads, most on day 1.')
  assert.equal(dailySummary(days([1, 0, 0, 0, 0, 0, 0], []), true), 'Reads over the first 7 days: 1 read, most on day 1.')
})

test('an empty chart says whether the 7 days are still running', () => {
  const start = '2026-10-11T10:00:00.000Z'
  const soon = new Date('2026-10-12T10:00:00.000Z')
  const later = new Date('2026-10-20T10:00:00.000Z')
  assert.equal(emptyChartText(false, start, soon), 'Nothing has been opened or clicked yet. Opens and clicks appear here as people read the email.')
  assert.equal(emptyChartText(false, start, later), 'Nothing was opened or clicked in the first 7 days.')
  assert.equal(emptyChartText(true, start, soon), 'Nothing has been read yet.')
  assert.equal(emptyChartText(true, start, later), 'Nothing was read in the first 7 days.')
  assert.equal(emptyChartText(false, null, later), 'Nothing has been opened or clicked yet. Opens and clicks appear here as people read the email.')
})

test('the tooltip box holds its lines and stays inside the plot', () => {
  const b = dayTipBox(['Day 3', 'Opens 40', 'Clicks 12'], 2, 10, 300, 200)
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 300 && b.y + b.h <= 200)
  assert.equal(b.h, 8 + 16 * 3 + 8)
})
