import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOP_MS, loopState, runLine, shouldAnimate } from './loop.ts'

test('the pulse reaches the condition, then Ask HR, and the stamp lands there', () => {
  assert.deepEqual(loopState(500), { path: 'p1', u: 0.5, stamp: false })
  assert.deepEqual(loopState(1600), { path: 'p2', u: 0.5, stamp: false })
  assert.deepEqual(loopState(3000), { path: null, u: 0, stamp: true })
  assert.deepEqual(loopState(5300), { path: null, u: 0, stamp: false })
})

test('every third loop takes the log branch and does not stamp', () => {
  assert.equal(loopState(2 * LOOP_MS + 1600).path, 'p3')
  assert.equal(loopState(2 * LOOP_MS + 3000).stamp, false)
  assert.equal(loopState(3 * LOOP_MS + 3000).stamp, true)
})

test('run lines read as sentences', () => {
  assert.equal(runLine(4821, 'Aisha K.', 7), '#4821 Aisha K. · 7 days · asked HR')
  assert.equal(runLine(4822, 'Ben T.', 1), '#4822 Ben T. · 1 day · logged')
})

test('nothing moves under reduced motion or ?motion=off', () => {
  assert.equal(shouldAnimate(false, ''), true)
  assert.equal(shouldAnimate(true, ''), false)
  assert.equal(shouldAnimate(false, '?motion=off'), false)
  assert.equal(shouldAnimate(false, '?a=1&motion=off'), false)
  assert.equal(shouldAnimate(false, '?motion=offline'), true)
})

import { showState } from './loop.ts'

test('a programme lights one card per slot and the pulse travels between them', () => {
  assert.deepEqual(showState(0, 4), { visited: 1, edge: -1, u: 0, slot: 0 })
  assert.deepEqual(showState(600, 4), { visited: 1, edge: 1, u: 0.5, slot: 600 / 900 })
  assert.equal(showState(900, 4).visited, 2)
  assert.deepEqual(showState(3 * 900 + 100, 4), { visited: 4, edge: -1, u: 0, slot: 1 })
  assert.equal(showState(3 * 900 + 2800, 4).visited, 1)
})
