import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BARS, MIN_CHART_WIDTH, chartGeometry, chartHeight, chartPoints, labelStep, niceTicks, showLabel, tooltipBox } from './chart.ts'

const r1 = (n: number) => Math.round(n * 10) / 10

test('ticks are round numbers that always include zero', () => {
  assert.deepEqual(niceTicks(0, 87), [0, 25, 50, 75, 100])
  assert.deepEqual(niceTicks(-12, 30), [-20, 0, 20, 40])
  assert.deepEqual(niceTicks(0, 0), [0, 1])
})

test('bars grow from the zero line both ways, and the line joins the bar centres', () => {
  const g = chartGeometry([{ label: 'a', value: 10, missing: false }, { label: 'b', value: -5, missing: false }], 248, 136)
  assert.deepEqual(g.ticks.map((t) => t.value), [-5, 0, 5, 10])
  assert.deepEqual(g.bars.map((b) => [r1(b.x), r1(b.y), r1(b.w), r1(b.h)]), [[62.4, 8, 67.2, 66.7], [158.4, 74.7, 67.2, 33.3]])
  assert.equal(r1(g.zeroY), 74.7)
  assert.equal(g.line, 'M96.0 8.0 L192.0 108.0')
})

test('the left margin grows to fit the widest tick label', () => {
  const small = chartGeometry([{ label: 'a', value: 5, missing: false }], 300, 200)
  const big = chartGeometry([{ label: 'a', value: 1234567, missing: false }], 300, 200)
  assert.equal(small.left, 48)
  assert.ok(big.left > 48)
})

test('chart points label empty keys, mark groups with no numbers and say how many are not drawn', () => {
  const groups = Array.from({ length: 30 }, (_, i) => ({ key: i === 0 ? null : `G${i}`, count: i, sum: i === 1 ? null : i * 2, skipped: 0 }))
  const { points, more } = chartPoints(groups.slice(0, MAX_BARS), 'sum', 30)
  assert.deepEqual([points.length, more, points[0].label, points[1]], [24, 6, 'No answer', { label: 'G1', value: 0, missing: true }])
  assert.deepEqual(chartPoints(groups.slice(0, 2), 'count', 2).points.map((p) => p.value), [0, 1])
})

test('the chart is measured, never scaled: short on phones, a table under the minimum width', () => {
  assert.deepEqual([chartHeight(303), chartHeight(480), MIN_CHART_WIDTH], [160, 200, 240])
})

test('category labels are thinned when bands are narrow, always keeping the first and last', () => {
  assert.deepEqual([labelStep(100), labelStep(56), labelStep(20)], [1, 1, 3])
  const shown = Array.from({ length: 10 }, (_, i) => i).filter((i) => showLabel(i, 10, 3))
  assert.deepEqual(shown, [0, 3, 6, 9])
})

test('the tooltip stays inside the plot', () => {
  const edge = tooltipBox(['Annual', '12'], 4, 20, 300, 200)
  const far = tooltipBox(['Annual', '12'], 296, 20, 300, 200)
  assert.ok(edge.x >= 0 && far.x + far.w <= 300)
  assert.ok(tooltipBox(['A', '1'], 150, 2, 300, 200).y >= 0)
})
