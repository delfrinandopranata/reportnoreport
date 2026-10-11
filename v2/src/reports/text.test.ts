import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellText, keyText, numText, pageText, shownText, skippedText, totalsText } from './text.ts'
import type { GroupsResult, RowsResult } from './logic.ts'

const rows = (total: number): RowsResult => ({ kind: 'rows', rows: [], total, totalRecords: total, page: 1, pageSize: 50 })
const groups = (total: number, totalRecords: number, skipped: number): GroupsResult =>
  ({ kind: 'groups', groups: [], total, totalRecords, grandTotal: null, skipped, page: 1, pageSize: 50 })

test('totals say how many records and groups', () => {
  assert.equal(totalsText(rows(1)), '1 record')
  assert.equal(totalsText(rows(1240)), '1,240 records')
  assert.equal(totalsText(groups(3, 240, 0)), '3 groups from 240 records')
  assert.equal(totalsText(groups(1, 1, 1)), '1 group from 1 record')
})

test('left-out values get their own sentence', () => {
  assert.deepEqual([skippedText(0), skippedText(1), skippedText(2), skippedText(1240)],
    ['', '1 value was not a number and was left out.', '2 values were not numbers and were left out.', '1,240 values were not numbers and were left out.'])
})

test('cells and group keys read as people expect', () => {
  assert.deepEqual([cellText(null), cellText(1234.5), cellText(-3), cellText('Annual')], ['', '1,234.5', '−3', 'Annual'])
  assert.equal(numText(-0.5), '−0.5')
  assert.deepEqual([keyText(null), keyText(2), keyText(-2), keyText('Annual')], ['No answer', '2', '−2', 'Annual'])
})

test('a date-only value is never shifted by the reader time zone', () => {
  assert.deepEqual([cellText('2026-10-01'), cellText('2026-12-31')], ['1 Oct 2026', '31 Dec 2026'])
})

test('paging and partial views always state the full count', () => {
  assert.deepEqual([pageText(2, 50, 240), pageText(1, 50, 0)], ['Page 2 of 5', 'Page 1 of 1'])
  assert.deepEqual([shownText(10, 240, 'record'), shownText(24, 31, 'group'), shownText(3, 3, 'record')],
    ['Showing 10 of 240 records', 'Showing the first 24 of 31 groups', ''])
})
