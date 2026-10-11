import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCsv } from './csv.ts'

test('csv quotes commas, quotes and line breaks', () => {
  assert.deepEqual(['a,b', 'say "hi"', 'two\nlines', 'cr\rhere', 'plain'].map(csvCell),
    ['"a,b"', '"say ""hi"""', '"two\nlines"', '"cr\rhere"', 'plain'])
})

test('csv guards cells that start a formula, headers included', () => {
  assert.deepEqual(['=1+1', '+SUM(A1)', '-5', '@cmd', '\tx', '=HYPERLINK("http://x","a,b")'].map(csvCell),
    ["'=1+1", "'+SUM(A1)", "'-5", "'@cmd", "'\tx", `"'=HYPERLINK(""http://x"",""a,b"")"`])
  assert.equal(toCsv(['=Total'], []), "﻿'=Total\r\n")
})

test('csv writes numbers as numbers and empty cells as nothing', () => {
  assert.deepEqual([12.5, -3, 0, null, ''].map(csvCell), ['12.5', '-3', '0', '', ''])
})

test('csv starts with a BOM and ends every row with CRLF', () => {
  assert.equal(toCsv(['Name', 'Days'], [['Ada', 3], ['Ben, Jr', null]]), '﻿Name,Days\r\nAda,3\r\n"Ben, Jr",\r\n')
})
