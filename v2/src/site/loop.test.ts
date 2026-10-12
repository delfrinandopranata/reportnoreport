import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldAnimate } from './loop.ts'

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

test('a short lead keeps the hero pulse moving almost the whole slot', () => {
  assert.equal(showState(100, 4, 120).edge, -1)
  assert.deepEqual(showState(120 + 390, 4, 120), { visited: 1, edge: 1, u: 0.5, slot: 510 / 900 })
})
