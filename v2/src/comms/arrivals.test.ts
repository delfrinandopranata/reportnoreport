import { test } from 'node:test'
import assert from 'node:assert/strict'
import { announcement, newArrivals } from './arrivals.ts'

const n = (id: string, read = false, title = id) => ({ id, title, read_at: read ? '2026-10-11T10:00:00Z' : null })

test('the first fetch seeds the seen set and announces nothing', () => {
  const r = newArrivals(null, [n('a'), n('b')])
  assert.deepEqual(r.arrived, [])
  assert.deepEqual([...r.seen].sort(), ['a', 'b'])
})
test('an unread id not seen before is an arrival; the seen set grows', () => {
  const first = newArrivals(null, [n('a')])
  const next = newArrivals(first.seen, [n('b'), n('a')])
  assert.deepEqual(next.arrived.map((x) => x.id), ['b'])
  assert.deepEqual([...next.seen].sort(), ['a', 'b'])
})
test('marking read, deleting and re-fetching the same rows announce nothing', () => {
  const first = newArrivals(null, [n('a'), n('b')])
  assert.deepEqual(newArrivals(first.seen, [n('a', true), n('b')]).arrived, [])
  assert.deepEqual(newArrivals(first.seen, [n('b')]).arrived, [])
})
test('a row that arrives already read is not announced', () => {
  const first = newArrivals(null, [])
  assert.deepEqual(newArrivals(first.seen, [n('c', true)]).arrived, [])
})
test('one arrival names its title; several are counted; none is silent', () => {
  assert.equal(announcement([n('a', false, 'Task assigned')]), 'New notification: Task assigned')
  assert.equal(announcement([n('a'), n('b'), n('c')]), '3 new notifications.')
  assert.equal(announcement([]), null)
})
