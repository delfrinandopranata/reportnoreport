import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertToken } from './insert.ts'

test('a token goes at the caret and the caret lands after it', () => {
  assert.deepEqual(insertToken('Hello ,', 6, 6, '{{recipient.name}}'), { value: 'Hello {{recipient.name}},', caret: 24 })
})
test('a selection is replaced', () => {
  assert.deepEqual(insertToken('Hello world', 6, 11, '{{org.name}}'), { value: 'Hello {{org.name}}', caret: 18 })
})
test('a missing caret appends', () => {
  assert.deepEqual(insertToken('Hi ', null, null, '{{org.name}}'), { value: 'Hi {{org.name}}', caret: 15 })
})
test('a reversed or out-of-range selection is clamped', () => {
  assert.deepEqual(insertToken('abc', 9, 2, 'X'), { value: 'abX', caret: 3 })
  assert.deepEqual(insertToken('abc', 2, 1, 'X'), { value: 'aXc', caret: 2 })
})
