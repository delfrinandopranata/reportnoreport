import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDay, hiddenKeys } from './display.ts'
import type { Field } from '../logic.ts'

test('formatDay renders ISO dates as en-GB and leaves other text alone', () => {
  assert.equal(formatDay('2026-10-12'), '12 Oct 2026')
  assert.equal(formatDay('not a date'), 'not a date')
})

test('hiddenKeys lists fields whose show_if was false when submitted', () => {
  const fields: Field[] = [
    { key: 'c', type: 'short_text', label: 'C' },
    { key: 'a', type: 'short_text', label: 'A', show_if: { field: 'c', operator: 'is', value: 'go' } },
  ]
  assert.deepEqual([...hiddenKeys(fields, { c: 'no' }, '2026-10-12T00:00:00Z')], ['a'])
  assert.deepEqual([...hiddenKeys(fields, { c: 'go' }, '2026-10-12T00:00:00Z')], [])
})
