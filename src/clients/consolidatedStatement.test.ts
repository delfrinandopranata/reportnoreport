import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { buildSections, countClients, preparedFrom } from './consolidatedStatement.ts'

const fmt = (minor: number) => `MYR ${(minor / 100).toFixed(2)}`
const row = (id: string) => ({ id })
const groups = [
  { key: 'c1', label: 'Harbourline Logistics Sdn Bhd', rows: [row('t1')], receipts: 500000, payments: 0 },
  { key: 'c2', label: 'Kopi Corner Sdn Bhd', rows: [row('t2'), row('t3')], receipts: 1040000, payments: 350000, closing: 690000 },
]

test('grouped: one section per group, in the order shown, with formatted subtotals', () => {
  const sections = buildSections(groups, 'client', fmt)
  assert.deepEqual(sections.map((s) => s.heading), ['Harbourline Logistics Sdn Bhd', 'Kopi Corner Sdn Bhd'])
  assert.deepEqual(sections[0].subtotal, { receipts: 'MYR 5000.00', payments: 'MYR 0.00' })
  assert.deepEqual(sections[1].subtotal, { receipts: 'MYR 10400.00', payments: 'MYR 3500.00', balance: 'MYR 6900.00' })
})

test('grouped: every row of every group is kept, including groups collapsed on screen', () => {
  assert.deepEqual(buildSections(groups, 'month', fmt).flatMap((s) => s.rows.map((r) => r.id)), ['t1', 't2', 't3'])
})

test('ungrouped: no heading and no subtotal (the grand total covers it)', () => {
  const [only] = buildSections([{ key: 'all', label: '', rows: [row('t1')], receipts: 1, payments: 0 }], 'none', fmt)
  assert.equal(only.heading, undefined)
  assert.equal(only.subtotal, undefined)
})

test('preparedFrom: no filters', () => {
  assert.equal(preparedFrom([], 'none'), 'All clients, no filters')
})

test('preparedFrom: filters and grouping once, capitalised, never duplicated', () => {
  assert.equal(preparedFrom(['receipts only', 'grouped by client'], 'client'), 'Receipts only · grouped by client')
  assert.equal(preparedFrom([], 'month'), 'Grouped by month')
})

test('countClients: distinct clients only', () => {
  assert.equal(countClients(['a', 'b', 'a']), 2)
})
