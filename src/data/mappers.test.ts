import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientToRow, parseAmount, rowToClient, rowToLine, sumBalances, toStatement } from './mappers.ts'

const row = {
  id: 'c1', firm_id: 'f', type: 'company', name: 'Kopi Corner', registration_no: '', client_code: '', industry: '', contact: 'Wei', phone: '+60123',
  email: 'a@b.c', website: '', address1: '', address2: '', postcode: '', city: '', state: '', country: 'Malaysia', status: 'active',
  tags: ['VIP'], assigned_to: null, notes: '', is_sample: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  created_by: null, updated_by: null,
} as const

test('rowToClient maps snake_case to the app Client', () => {
  const c = rowToClient(row as never)
  assert.equal(c.registrationNo, '')
  assert.equal(c.clientCode, '')
  assert.equal(c.assignedUserId, undefined)
  assert.deepEqual(c.tags, ['VIP'])
  // client-since is the viewer's local calendar date, so compute the expectation the same way (timezone-independent)
  assert.equal(c.createdAt, new Date('2026-01-01T00:00:00Z').toLocaleDateString('en-CA'))
  assert.equal(c.updatedAt, '2026-02-01T00:00:00Z')
})

test('clientToRow only includes fields that were given', () => {
  assert.deepEqual(clientToRow({ name: 'X', assignedUserId: undefined, registrationNo: '123' }), { name: 'X', assigned_to: null, registration_no: '123' })
  assert.deepEqual(clientToRow({ clientCode: 'ABC-001' }), { client_code: 'ABC-001' })
})

test('rowToLine maps receipt/payment to in/out', () => {
  const l = rowToLine({ id: 't', client_id: 'c', bank_account_id: 'b', kind: 'payment', amount_minor: 1250, date: '2026-09-01', description: 'Fee', created_at: 'x', updated_at: 'y', balance: -1250 })
  assert.deepEqual([l.kind, l.amount, l.note, l.balance, l.bankAccountId], ['out', 1250, 'Fee', -1250, 'b'])
})

test('toStatement and sumBalances', () => {
  const b = { client_id: 'c', opening: 100, receipts: 50, payments: 20, closing: 130, txn_count: 2, last_txn_date: '2026-09-30' }
  assert.deepEqual(toStatement(b, []), { opening: 100, receipts: 50, payments: 20, closing: 130, lines: [] })
  assert.deepEqual(toStatement(undefined, []), { opening: 0, receipts: 0, payments: 0, closing: 0, lines: [] })
  assert.deepEqual(sumBalances([b, { ...b, opening: -10, closing: 20 }]).closing, 150)
})

test('parseAmount rejects amounts above the database cap', () => {
  assert.deepEqual(parseAmount('12.50'), { ok: true, cents: 1250 })
  assert.equal(parseAmount('99999999999999').ok, false)
  assert.match((parseAmount('99999999999999') as { error: string }).error, /too large/)
  assert.equal(parseAmount('abc').ok, false)
})
