import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAGE_ROWS, readAllPages } from './pages.ts'

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

test('reads every page until a short one', async () => {
  const all = Array.from({ length: 2_500 }, (_, i) => ({ id: id(i) }))
  const calls: string[] = []
  const rows = await readAllPages(async (after) => { calls.push(after); return all.filter((r) => r.id > after).slice(0, PAGE_ROWS) }, 2_500)
  assert.equal(rows !== 'changed' && rows.length, 2_500)
  assert.deepEqual(calls, ['00000000-0000-0000-0000-000000000000', id(999), id(1_999)])
})

test('csv refuses a short download', async () => {
  // A row deleted or added between the count and the pages: refused, never a short file.
  assert.equal(await readAllPages(async () => [{ id: id(1) }], 2), 'changed')
  assert.equal(await readAllPages(async () => [{ id: id(1) }, { id: id(2) }], 1), 'changed')
})
