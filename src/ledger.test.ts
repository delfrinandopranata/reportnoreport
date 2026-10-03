import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addTag, fillClient, formatPhone, joinPhone, splitPhone, validateClient, groupBy, periodPresets, parseCsv, readImport, monthlyFlow, parseCents, plainAmount, statement, toCsv, totals, totalsByClient, type Txn } from './ledger.ts'

const txn = (clientId: string, kind: Txn['kind'], amount: number, date: string): Txn => ({
  id: `${clientId}-${date}-${amount}`,
  clientId,
  bankAccountId: 'b',
  kind,
  amount,
  date,
  note: '',
  createdAt: '',
  updatedAt: '',
})

test('parseCents avoids float rounding and rejects bad input', () => {
  assert.equal(parseCents('12.34'), 1234)
  assert.equal(parseCents('1,234.5'), 123450)
  assert.equal(parseCents('0.29'), 29)
  assert.equal(parseCents('100'), 10000)
  for (const bad of ['', '1.234', 'abc', '1e3']) assert.equal(parseCents(bad), null, bad)
})

test('parseCents allows negative and zero — a firm may record an under/overpayment freely', () => {
  assert.equal(parseCents('0'), 0)
  assert.equal(parseCents('0.00'), 0)
  assert.equal(parseCents('-5'), -500)
  assert.equal(parseCents('-12.34'), -1234)
  assert.equal(parseCents('-1,234.5'), -123450)
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

test('statement rolls prior entries into the opening balance and runs the balance through the period', () => {
  const txns = [
    txn('a', 'in', 10000, '2026-08-20'),
    txn('a', 'out', 2500, '2026-08-31'),
    txn('a', 'out', 1000, '2026-09-05'),
    txn('a', 'in', 400, '2026-09-30'),
    txn('a', 'in', 999, '2026-10-01'),
  ]
  const s = statement(txns, '2026-09-01', '2026-09-30')
  assert.equal(s.opening, 7500)
  assert.deepEqual(s.lines.map((l) => l.balance), [6500, 6900])
  assert.deepEqual([s.receipts, s.payments, s.closing], [400, 1000, 6900])
  assert.equal(s.closing, s.lines.at(-1)?.balance)
})

test('groupBy keeps first-seen order', () => {
  const groups = groupBy(['b1', 'a1', 'b2'], (s) => s[0])
  assert.deepEqual([...groups], [['b', ['b1', 'b2']], ['a', ['a1']]])
})

test('toCsv quotes, escapes and neutralises formulas but keeps numbers', () => {
  assert.equal(plainAmount(-123456), '-1234.56')
  assert.equal(
    toCsv([['Date', 'Note', 'Balance'], ['2026-09-01', 'Fees, "urgent"', '-12.50'], ['2026-09-02', '=HYPERLINK("x")', '3.00']]),
    'Date,Note,Balance\r\n2026-09-01,"Fees, ""urgent""",-12.50\r\n2026-09-02,"\'=HYPERLINK(""x"")",3.00',
  )
})

test('parseCsv handles quotes, escaped quotes, CRLF and BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFa,"b,c","say ""hi"""\r\n1,2,3\n\n'), [['a', 'b,c', 'say "hi"'], ['1', '2', '3']])
})

test('readImport round-trips an export and reports bad rows', () => {
  const csv = toCsv([
    ['Date', 'Client', 'Account no.', 'Description', 'Type', 'Receipts', 'Payments', 'Balance'],
    ['2026-09-01', 'Kopi Corner', 'ABC', '=SUM(A1)', 'Receipt', '1234.50', '', '1234.50'],
    ['03/09/2026', 'Kopi Corner', '', 'Fees', 'Payment', '', 'RM 10', '1224.50'],
    ['2026-02-30', 'Kopi Corner', '', '', '', '5', '', ''],
    ['2026-09-04', 'Kopi Corner', '', '', '', '5', '6', ''],
  ])
  const { rows, errors } = readImport(csv, 'MYR')
  assert.deepEqual(rows.map((r) => [r.date, r.kind, r.amount, r.note]), [
    ['2026-09-01', 'in', 123450, '=SUM(A1)'],
    ['2026-09-03', 'out', 1000, 'Fees'],
  ])
  assert.equal(errors.length, 2)
  assert.match(errors[0], /Row 4: date/)
  assert.match(errors[1], /Row 5: has both/)
  assert.match(readImport('Date,Description\n2026-01-01,x', 'MYR').errors[0], /Missing columns: client, receipts/)
})

test('readImport reads an optional bank account column', () => {
  const { rows } = readImport('Date,Client,Bank account,Receipts\n2026-09-01,Kopi,CIMB escrow,10', 'MYR')
  assert.equal(rows[0].bankAccount, 'CIMB escrow')
})

test('readImport accepts the firm currency code on amounts', () => {
  const { rows, errors } = readImport('Date,Client,Receipts,Payments\n2026-09-01,Kopi,"MYR 1,250.00",\n2026-09-02,Kopi,,myr10\n2026-09-03,Kopi,rm 5,', 'MYR')
  assert.deepEqual(errors, [])
  assert.deepEqual(rows.map((r) => r.amount), [125000, 1000, 500])
})

test('readImport rejects amounts in another currency', () => {
  const head = 'Date,Client,Receipts\n'
  const a = readImport(head + '2026-09-01,Kopi,5\n2026-09-02,Kopi,SGD 10', 'MYR')
  assert.deepEqual(a.errors, ['Row 3: amount is in SGD but this firm uses MYR.'])
  assert.equal(a.rows.length, 1)
  assert.deepEqual(readImport(head + '2026-09-01,Kopi,RM 5', 'SGD').errors, ['Row 2: amount is in MYR but this firm uses SGD.'])
  assert.equal(readImport(head + '2026-09-01,Kopi,SGD 5', 'SGD').rows[0].amount, 500)
})

test('fillClient defaults an old record and keeps what it has', () => {
  const c = fillClient({ id: '1', name: 'Old Co', contact: 'A', email: 'a@x.my', createdAt: '2026-01-02' }, '2026-10-03T08:00:00.000Z')
  assert.equal(c.status, 'active')
  assert.equal(c.country, 'Malaysia')
  assert.deepEqual(c.tags, [])
  assert.equal(c.updatedAt, '2026-10-03T08:00:00.000Z')
  assert.equal(c.contact, 'A')
})

test('phone helpers round-trip E.164 and drop the trunk zero', () => {
  assert.equal(joinPhone('+60', '012-345 6789'), '+60123456789')
  assert.equal(joinPhone('+60', ''), '')
  assert.deepEqual(splitPhone('+60123456789'), ['+60', '123456789'])
  assert.deepEqual(splitPhone('+6731234567'), ['+673', '1234567'])
  assert.equal(formatPhone('+60123456789'), '+60 12-345 6789')
  assert.equal(formatPhone(''), '')
})

test('validateClient checks name, email, phone and Malaysian postcode', () => {
  const ok = { name: 'A', email: '', phone: '', postcode: '', country: 'Malaysia' }
  assert.deepEqual(validateClient(ok), {})
  assert.ok(validateClient({ ...ok, name: '  ' }).name)
  assert.ok(validateClient({ ...ok, email: 'nope' }).email)
  assert.ok(validateClient({ ...ok, phone: '+601' }).phone)
  assert.ok(validateClient({ ...ok, postcode: '5000' }).postcode)
  assert.deepEqual(validateClient({ ...ok, postcode: '50450' }), {})
  assert.deepEqual(validateClient({ ...ok, country: 'Singapore', postcode: '018956' }), {})
})

test('addTag trims, caps and dedupes case-insensitively', () => {
  assert.deepEqual(addTag(['VIP'], ' vip '), ['VIP'])
  assert.deepEqual(addTag(['VIP'], 'Retainer'), ['VIP', 'Retainer'])
  assert.deepEqual(addTag([], '   '), [])
})

test('periodPresets starts year to date at the financial year start', () => {
  const ytd = (fy: number, now: string) => periodPresets('2020-01-01', fy, new Date(`${now}T12:00`))[3]
  assert.deepEqual([ytd(1, '2026-10-03').label, ytd(1, '2026-10-03').period.from], ['Year to date', '2026-01-01'])
  assert.deepEqual([ytd(7, '2026-10-03').label, ytd(7, '2026-10-03').period.from], ['Financial year to date', '2026-07-01'])
  assert.equal(ytd(7, '2026-03-15').period.from, '2025-07-01')
  assert.equal(ytd(4, '2026-04-01').period.from, '2026-04-01')
})
