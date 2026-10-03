import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysUntilEnd, endsInLabel, isEndingSoon } from './status.ts'

test('daysUntilEnd: counts whole days, negative once past', () => {
  assert.equal(daysUntilEnd('2026-10-04', '2026-10-04'), 0)
  assert.equal(daysUntilEnd('2026-10-11', '2026-10-04'), 7)
  assert.equal(daysUntilEnd('2026-10-01', '2026-10-04'), -3)
})

test('endsInLabel: ended, today, tomorrow, N days', () => {
  assert.equal(endsInLabel('2026-10-03', '2026-10-04'), 'Ended')
  assert.equal(endsInLabel('2026-10-04', '2026-10-04'), 'Ends today')
  assert.equal(endsInLabel('2026-10-05', '2026-10-04'), 'Ends tomorrow')
  assert.equal(endsInLabel('2026-12-03', '2026-10-04'), 'Ends in 60 days')
})

test('isEndingSoon: only today through 7 days out', () => {
  assert.equal(isEndingSoon('2026-10-04', '2026-10-04'), true)
  assert.equal(isEndingSoon('2026-10-11', '2026-10-04'), true)
  assert.equal(isEndingSoon('2026-10-12', '2026-10-04'), false)
  assert.equal(isEndingSoon('2026-10-03', '2026-10-04'), false)
})
