import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, readPath, toDay } from './rules.ts'
import type { Rule } from './types.ts'

const now = new Date('2026-10-11T12:00:00Z')
const a = {
  status: 'approved', age: 17, tags: ['art', 'music'], note: 'Needs Bus pass', dob: '2026-10-01', empty: '',
  family: [{ relation: 'mother', age: 40 }, { relation: 'brother', age: 9 }],
}
const ev = (field: string, operator: string, value?: unknown, answers: Record<string, unknown> = a) =>
  evaluate({ field, operator, value } as Rule, answers, now)

test('is / is_not compare scalars as text', () => {
  assert.equal(ev('status', 'is', 'approved'), true)
  assert.equal(ev('age', 'is', '17'), true)
  assert.equal(ev('status', 'is_not', 'approved'), false)
  assert.equal(ev('missing', 'is_not', 'x'), true)
  assert.equal(ev('flag', 'is', true, { flag: true }), true)
})
test('is_one_of over a scalar and over a list answer', () => {
  assert.equal(ev('status', 'is_one_of', ['draft', 'approved']), true)
  assert.equal(ev('tags', 'is_one_of', ['music']), true)
  assert.equal(ev('tags', 'is_one_of', ['sport']), false)
})
test('contains is case-insensitive on text and exact on lists', () => {
  assert.equal(ev('note', 'contains', 'bus'), true)
  assert.equal(ev('tags', 'contains', 'art'), true)
  assert.equal(ev('tags', 'contains', 'ar'), false)
  assert.equal(ev('note', 'contains', ''), false)
})
test('is_empty / is_not_empty', () => {
  assert.equal(ev('empty', 'is_empty'), true)
  assert.equal(ev('missing', 'is_empty'), true)
  assert.equal(ev('x', 'is_empty', undefined, { x: [] }), true)
  assert.equal(ev('x', 'is_empty', undefined, { x: false }), true)
  assert.equal(ev('tags', 'is_not_empty'), true)
})
test('gt / lt on numbers and dates', () => {
  assert.equal(ev('age', 'gt', 16), true)
  assert.equal(ev('age', 'lt', '18'), true)
  assert.equal(ev('dob', 'gt', '2026-09-30'), true)
  assert.equal(ev('dob', 'lt', '2026-09-30'), false)
})
test('within_days counts whole UTC days either side of today', () => {
  assert.equal(ev('dob', 'within_days', 10), true)
  assert.equal(ev('dob', 'within_days', 9), false)
  assert.equal(ev('d', 'within_days', 10, { d: '2026-10-21' }), true)
  assert.equal(ev('dob', 'within_days', -1), false)
})
test('group[].field matches when any row matches', () => {
  assert.equal(ev('family[].relation', 'is', 'brother'), true)
  assert.equal(ev('family[].age', 'gt', 50), false)
  assert.equal(ev('nobody[].relation', 'is_empty'), false)
})
test('group.count', () => {
  assert.equal(ev('family.count', 'is', 2), true)
  assert.equal(ev('family.count', 'gt', 1), true)
  assert.equal(ev('nobody.count', 'is', 0), true)
})
test('unreadable values are false and never throw', () => {
  const results = [
    ev('status[].x', 'is', 'a'),
    ev('family.count.x', 'is', 1),
    ev('', 'is', ''),
    ev('age', 'gt', 'abc'),
    ev('dob', 'within_days', 'x'),
    ev('status', 'is_one_of', 'approved'),
    ev('status', 'is', 'approved', null as never),
    ev('family[].relation', 'is', 'mother', { family: [1, 2] }),
    evaluate(null as never, a, now),
    evaluate({ field: 'status', operator: 'nope' } as never, a, now),
  ]
  assert.deepEqual(results, results.map(() => false))
})
test('readPath and toDay', () => {
  assert.deepEqual(readPath(a, 'family[].relation'), ['mother', 'brother'])
  assert.equal(readPath(a, 'status[].x'), null)
  assert.equal(toDay('2026-02-30'), null)
  assert.equal(toDay('2026-2-1'), null)
  assert.equal(typeof toDay('2026-10-11'), 'number')
})
