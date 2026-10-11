import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { seriesOf } from './columnSeries.ts'

test('receipts and payments columns are series with their own words', () => {
  assert.deepEqual(seriesOf('receipts'), { series: 'in', word: 'Receipts' })
  assert.deepEqual(seriesOf('payments'), { series: 'out', word: 'Payments' })
  assert.equal(seriesOf('balance'), null)
})

test('on screen the headers say Receipts and Payments; exports keep In and Out', () => {
  const src = readFileSync(new URL('./ClientsPage.tsx', import.meta.url), 'utf8')
  assert.match(src, /id: 'receipts', label: 'Receipts'/)
  assert.match(src, /id: 'payments', label: 'Payments'/)
  assert.match(src, /\{ receipts: 'In', payments: 'Out' \}/)
  assert.doesNotMatch(src, /label: 'In'|label: 'Out'/)
})
