import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERMISSIONS, PERMISSION_GROUPS, can } from './permissions.ts'

test('eleven permissions, matching the database seed', () => {
  assert.equal(PERMISSIONS.length, 11)
})
test('every permission appears in exactly one group', () => {
  const grouped = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)).sort()
  assert.deepEqual(grouped, [...PERMISSIONS].sort())
})
test('can checks membership of the held set', () => {
  const held = new Set(['reports.view'])
  assert.equal(can(held, 'reports.view'), true)
  assert.equal(can(held, 'roles.manage'), false)
})
