import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { seriesOf } from './columnSeries.ts'

test('receipts and payments columns are series with their own words', () => {
  assert.deepEqual(seriesOf('receipts'), { series: 'in', word: 'Receipts' })
  assert.deepEqual(seriesOf('payments'), { series: 'out', word: 'Payments' })
  assert.equal(seriesOf('balance'), null)
})

test('the CSV headers still read In and Out', () => {
  const src = readFileSync(new URL('./ClientsPage.tsx', import.meta.url), 'utf8')
  assert.match(src, /id: 'receipts', label: 'In'/)
  assert.match(src, /id: 'payments', label: 'Out'/)
})
