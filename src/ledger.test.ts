import assert from 'node:assert/strict'
import { test } from 'node:test'
import { monthlyFlow, parseCents, totals, totalsByClient, type Txn } from './ledger.ts'

const txn = (clientId: string, kind: Txn['kind'], amount: number, date: string): Txn => ({
  id: `${clientId}-${date}-${amount}`,
  clientId,
  kind,
  amount,
  date,
  note: '',
})

test('parseCents avoids float rounding and rejects bad input', () => {
  assert.equal(parseCents('12.34'), 1234)
  assert.equal(parseCents('1,234.5'), 123450)
  assert.equal(parseCents('0.29'), 29)
  assert.equal(parseCents('100'), 10000)
  for (const bad of ['', '0', '0.00', '-5', '1.234', 'abc', '1e3']) assert.equal(parseCents(bad), null, bad)
})

test('totals and per-client balances', () => {
  const txns = [txn('a', 'in', 5000, '2026-09-01'), txn('a', 'out', 1250, '2026-09-02'), txn('b', 'out', 300, '2026-09-03')]
  assert.deepEqual(totals(txns), { in: 5000, out: 1550, net: 3450, count: 3 })
  const byClient = totalsByClient(txns)
  assert.equal(byClient.get('a')?.net, 3750)
  assert.equal(byClient.get('b')?.net, -300)
})

test('monthlyFlow buckets the trailing months across a year boundary', () => {
  const txns = [txn('a', 'in', 100, '2025-12-31'), txn('a', 'out', 40, '2026-02-10'), txn('a', 'in', 9, '2025-01-01')]
  const flow = monthlyFlow(txns, 3, '2026-02-15')
  assert.deepEqual(flow.map((f) => f.key), ['2025-12', '2026-01', '2026-02'])
  assert.deepEqual(flow.map((f) => [f.in, f.out]), [[100, 0], [0, 0], [0, 40]])
})
