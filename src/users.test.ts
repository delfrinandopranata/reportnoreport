import assert from 'node:assert/strict'
import { test } from 'node:test'
import { can, canManageUser, type User } from './users/rules.ts'

const user = (id: string, role: User['role'], status: User['status'] = 'active', extra: Partial<User> = {}): User => ({
  id, name: id, email: `${id}@x.my`, role, status, createdAt: '2026-01-01T00:00:00Z', ...extra,
})
const team = () => [user('o', 'owner'), user('a', 'admin'), user('c', 'accountant'), user('v', 'viewer', 'invited')]

test('permission matrix', () => {
  for (const action of ['clients.edit', 'clients.delete', 'transactions.post', 'transactions.delete', 'users.manage', 'settings.manage'] as const) {
    assert.ok(can('owner', action))
    assert.ok(can('admin', action))
    assert.equal(can('viewer', action), false)
  }
  assert.ok(can('accountant', 'clients.edit') && can('accountant', 'transactions.post') && can('accountant', 'transactions.delete'))
  assert.equal(can('accountant', 'clients.delete'), false)
  assert.equal(can('accountant', 'users.manage'), false)
  assert.equal(can('accountant', 'settings.manage'), false)
})

test('nobody manages the owner or themselves; only users.manage roles manage others', () => {
  const users = team()
  assert.equal(canManageUser(users[1], users[0]), false)
  assert.equal(canManageUser(users[0], users[1]), true)
  assert.equal(canManageUser(users[0], users[0]), false)
  assert.equal(canManageUser(users[2], users[3]), false)
})
