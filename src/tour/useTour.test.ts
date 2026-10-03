import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { shouldAutoStart, type TourState } from './autoStart.ts'

test('shouldAutoStart: true when status is not_started and user has firm', () => {
  const pref: TourState = { status: 'not_started', step: 0 }
  assert.equal(shouldAutoStart(pref, true), true)
})

test('shouldAutoStart: false when status is in_progress', () => {
  const pref: TourState = { status: 'in_progress', step: 2 }
  assert.equal(shouldAutoStart(pref, true), false)
})

test('shouldAutoStart: false when status is done', () => {
  const pref: TourState = { status: 'done', step: 10 }
  assert.equal(shouldAutoStart(pref, true), false)
})

test('shouldAutoStart: false when status is skipped', () => {
  const pref: TourState = { status: 'skipped', step: 0 }
  assert.equal(shouldAutoStart(pref, true), false)
})

test('shouldAutoStart: false when user has no firm', () => {
  const pref: TourState = { status: 'not_started', step: 0 }
  assert.equal(shouldAutoStart(pref, false), false)
})

test('shouldAutoStart: false when status is not_started but no firm', () => {
  const pref: TourState = { status: 'not_started', step: 0 }
  assert.equal(shouldAutoStart(pref, false), false)
})
