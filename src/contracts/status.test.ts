import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysUntilEnd, endingSoonHint } from './status.ts'

test('daysUntilEnd: counts whole days, negative once past', () => {
  assert.equal(daysUntilEnd('2026-10-04', '2026-10-04'), 0)
  assert.equal(daysUntilEnd('2026-10-11', '2026-10-04'), 7)
  assert.equal(daysUntilEnd('2026-10-01', '2026-10-04'), -3)
})

test('endingSoonHint: only for approved contracts within 7 days', () => {
  assert.equal(endingSoonHint('pending_review', '2026-10-05', '2026-10-04'), '')
  assert.equal(endingSoonHint('rejected', '2026-10-05', '2026-10-04'), '')
  assert.equal(endingSoonHint('approved', '2026-10-20', '2026-10-04'), '')
  assert.equal(endingSoonHint('approved', '2026-10-03', '2026-10-04'), '')
})

test('endingSoonHint: wording for today, tomorrow and N days', () => {
  assert.equal(endingSoonHint('approved', '2026-10-04', '2026-10-04'), 'Ends today')
  assert.equal(endingSoonHint('approved', '2026-10-05', '2026-10-04'), 'Ends tomorrow')
  assert.equal(endingSoonHint('approved', '2026-10-09', '2026-10-04'), 'Ends in 5 days')
})
