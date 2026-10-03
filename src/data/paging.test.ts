import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchAll } from './paging.ts'

const source = (total: number) => async (from: number, to: number) => ({
  data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i),
  error: null,
})

test('fetchAll pages until a short page', async () => {
  assert.equal((await fetchAll(source(0))).length, 0)
  assert.equal((await fetchAll(source(1000))).length, 1000)
  const rows = await fetchAll(source(2500))
  assert.equal(rows.length, 2500)
  assert.equal(rows[2499], 2499)
})

test('fetchAll throws the page error', async () => {
  await assert.rejects(fetchAll(async () => ({ data: null, error: new Error('boom') })), /boom/)
})
