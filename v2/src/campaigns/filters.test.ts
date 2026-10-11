import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOT_OPENED, applyOps, recipientOps } from './filters.ts'

test('not opened excludes bounced and complained, exactly like the follow-up audience', () => {
  assert.deepEqual(recipientOps('not_opened'), NOT_OPENED)
  assert.deepEqual(NOT_OPENED.map(([, c]) => c), ['status', 'opened_at', 'bounced_at', 'complained_at'])
  assert.deepEqual(recipientOps('all'), [])
})

test('ops apply to a query builder in order', () => {
  const log: string[] = []
  const q = { eq: (c: string, v: string) => (log.push(`eq ${c} ${v}`), q), is: (c: string) => (log.push(`is ${c}`), q), not: (c: string) => (log.push(`not ${c}`), q) }
  applyOps(q, recipientOps('bounced'))
  applyOps(q, recipientOps('failed'))
  assert.deepEqual(log, ['not bounced_at', 'eq status failed'])
})
