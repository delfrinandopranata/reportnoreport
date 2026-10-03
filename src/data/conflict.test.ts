import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyEmptyUpdate } from './conflict.ts'

test('classifyEmptyUpdate', () => {
  assert.equal(classifyEmptyUpdate(null, 'a'), 'gone')
  assert.equal(classifyEmptyUpdate({ updated_at: 'b' }, 'a'), 'conflict')
  assert.equal(classifyEmptyUpdate({ updated_at: 'a' }, 'a'), 'blocked')
})
