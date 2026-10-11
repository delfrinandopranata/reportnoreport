import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellOf, runReport, type GroupsResult, type RowsResult } from './run.ts'
import { readReportDef, readTemplate, type Column, type ReportDef } from './definition.ts'
import { dataColumns } from './catalogue.ts'
import { CTX, rec } from './fixture.ts'

const def = (d: Partial<ReportDef>): ReportDef => ({ columns: [{ meta: 'title' }], filters: [], groupBy: null, aggregate: null, ...d })
const page1 = { page: 1, pageSize: 50 }

test('cells read answers, record details and repeating rows', () => {
  const r = rec('a', {
    name: 'Ada', days: 3, cover: ['Team lead', 'Peer'], agree: true, blank: '  ',
    claims: [{ item: 'Taxi', amount: 12.5 }, { item: 'Meal', amount: 8 }],
  }, { current_node_id: 'approve', status: 'open' })
  const cols: Column[] = [
    { field: 'name' }, { field: 'days' }, { field: 'cover' }, { field: 'agree' }, { field: 'claims[].item' }, { field: 'claims.count' },
    { field: 'blank' }, { field: 'missing' }, { meta: 'status' }, { meta: 'step' }, { meta: 'started_by' }, { meta: 'created_at' },
  ]
  assert.deepEqual(cols.map((c) => cellOf(r, c, CTX)),
    ['Ada', 3, 'Team lead, Peer', 'Yes', 'Taxi, Meal', 2, null, null, 'In progress', 'Manager approval', 'Ada Lovelace', '2026-10-01T09:00:00Z'])
})

test('filters use the shared rule operators and all must match', () => {
  const rows = [rec('a', { leave_type: 'Annual', days: 3 }), rec('b', { leave_type: 'Medical', days: 9 }), rec('c', { leave_type: 'Annual', days: 5 })]
  const r = runReport(rows, def({ filters: [{ field: 'leave_type', operator: 'is', value: 'Annual' }, { field: 'days', operator: 'gt', value: 4 }] }), CTX, page1) as RowsResult
  assert.deepEqual([r.rows.map((x) => x.id), r.total], [['c'], 1])
})

test('rows are paged with the full total', () => {
  const rows = Array.from({ length: 120 }, (_, i) => rec(`r${i}`, {}))
  const r = runReport(rows, def({}), CTX, { page: 2, pageSize: 50 }) as RowsResult
  assert.deepEqual([r.kind, r.rows.length, r.rows[0].id, r.rows[49].id, r.total, r.totalRecords, r.page], ['rows', 50, 'r50', 'r99', 120, 120, 2])
  assert.equal((runReport(rows, def({}), CTX, { page: 1, pageSize: 500 }) as RowsResult).pageSize, 100)
  const all = runReport(rows, def({}), CTX, null) as RowsResult
  assert.deepEqual([all.rows.length, all.total, all.pageSize], [120, 120, 120])
})

test('a page past the end keeps the totals', () => {
  const rows = Array.from({ length: 120 }, (_, i) => rec(`r${i}`, {}))
  const r = runReport(rows, def({}), CTX, { page: 4, pageSize: 50 }) as RowsResult
  assert.deepEqual([r.rows, r.total, r.page], [[], 120, 4])
})

test('groups count records, empty keys go last as No answer', () => {
  const rows = [rec('a', { t: 'Annual' }), rec('b', { t: 'Medical' }), rec('c', {}), rec('d', { t: 'Annual' }), rec('e', { t: '' })]
  const r = runReport(rows, def({ groupBy: { field: 't' }, aggregate: { fn: 'count' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups, [
    { key: 'Annual', count: 2, sum: null, skipped: 0 },
    { key: 'Medical', count: 1, sum: null, skipped: 0 },
    { key: null, count: 2, sum: null, skipped: 0 },
  ])
  assert.deepEqual([r.total, r.totalRecords, r.grandTotal], [3, 5, 5])
  const byNumber = runReport([rec('a', { n: 10 }), rec('b', { n: 2 }), rec('c', { n: 10 })], def({ groupBy: { field: 'n' }, aggregate: { fn: 'count' } }), CTX, page1) as GroupsResult
  assert.deepEqual(byNumber.groups.map((g) => g.key), [2, 10])
})

test('sum adds numbers only and counts what it left out', () => {
  const rows = [
    rec('a', { t: 'Annual', days: 3 }), rec('b', { t: 'Annual', days: '4' }), rec('c', { t: 'Annual', days: null }),
    rec('d', { t: 'Medical', days: 2 }), rec('e', { t: 'Medical', days: true }),
  ]
  const r = runReport(rows, def({ groupBy: { field: 't' }, aggregate: { fn: 'sum', field: 'days' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups, [
    { key: 'Annual', count: 3, sum: 3, skipped: 1 },
    { key: 'Medical', count: 2, sum: 2, skipped: 1 },
  ])
  assert.deepEqual([r.grandTotal, r.skipped], [5, 2])
})

test('a group with no numbers sums to null', () => {
  const r = runReport([rec('a', { t: 'Other', days: 'n/a' })], def({ groupBy: { field: 't' }, aggregate: { fn: 'sum', field: 'days' } }), CTX, page1) as GroupsResult
  assert.deepEqual([r.groups, r.grandTotal], [[{ key: 'Other', count: 1, sum: null, skipped: 1 }], null])
})

test('sums are rounded so 0.1 + 0.2 is 0.3', () => {
  const rows = [rec('a', { t: 'x', v: 0.1 }), rec('b', { t: 'x', v: 0.2 }), rec('c', { t: 'y', v: -1.5 }), rec('d', { t: 'y', v: 1 })]
  const r = runReport(rows, def({ groupBy: { field: 't' }, aggregate: { fn: 'sum', field: 'v' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups.map((g) => g.sum), [0.3, -0.5])
  assert.equal(r.grandTotal, -0.2)
})

test('a repeating path sums every row', () => {
  const rows = [rec('a', { claims: [{ amount: 12.5 }, { amount: 8 }] }), rec('b', { claims: [{ amount: 'x' }] })]
  const r = runReport(rows, def({ groupBy: { meta: 'status' }, aggregate: { fn: 'sum', field: 'claims[].amount' } }), CTX, page1) as GroupsResult
  assert.deepEqual(r.groups, [{ key: 'Done', count: 2, sum: 20.5, skipped: 1 }])
})

test('readReportDef refuses broken definitions with a sentence', () => {
  const bad = (raw: Record<string, unknown>) => { const p = readReportDef(raw); return p.ok ? 'ok' : p.error }
  assert.equal(bad({ columns: [] }), 'Choose at least one column.')
  assert.equal(bad({ columns: [{ meta: 'nope' }] }), 'A column points at something that does not exist. Remove it and choose again.')
  assert.equal(bad({ columns: [{ meta: 'title' }], filters: [{ field: 'days', operator: 'between' }] }), 'Every filter needs a field and a condition.')
  assert.equal(bad({ columns: [{ meta: 'title' }], group_by: { field: 'x' } }), 'Choose whether to count records or add up a number for each group.')
  assert.equal(bad({ columns: [{ meta: 'title' }], group_by: { field: 'x' }, aggregate: { fn: 'sum', field: 'Bad Key' } }), 'Choose a number field to add up.')
  assert.equal(bad({ columns: [{ meta: 'title' }], aggregate: { fn: 'count' } }), 'Choose a column to group by, or remove the total.')
  assert.deepEqual(readReportDef({ columns: [{ meta: 'title' }, { field: 'claims[].item' }], filters: null, group_by: null, aggregate: null }),
    { ok: true, value: { columns: [{ meta: 'title' }, { field: 'claims[].item' }], filters: [], groupBy: null, aggregate: null } })
})

test('readTemplate keeps a valid template and refuses a broken one', () => {
  const ok = { header: 'Leave', fields: [{ nodeId: 'start', key: 'name' }], signoff: ['approve'] }
  assert.deepEqual(readTemplate(ok), ok)
  assert.equal(readTemplate({ ...ok, header: 'x'.repeat(2001) }), null)
  assert.equal(readTemplate({ ...ok, fields: [{ nodeId: 'Start Node', key: 'name' }] }), null)
  assert.equal(readTemplate({ ...ok, signoff: 'approve' }), null)
})

test('dataColumns: first step wins a key, groups give row paths and a count', () => {
  const cols = dataColumns([
    { nodeId: 'start', step: 'Start', fields: [
      { key: 'name', type: 'short_text', label: 'Full name' },
      { key: 'claims', type: 'group', label: 'Claims', fields: [{ key: 'amount', type: 'number', label: 'Amount' }] },
    ] },
    { nodeId: 'approve', step: 'Manager approval', fields: [
      { key: 'name', type: 'short_text', label: 'Approver name' },
      { key: 'comment', type: 'long_text', label: 'Comment' },
    ] },
  ])
  assert.deepEqual(cols.map((c) => [c.path, c.label]), [
    ['name', 'Full name'], ['claims.count', 'Claims: number of rows'], ['claims[].amount', 'Claims: Amount'], ['comment', 'Comment'],
  ])
})
