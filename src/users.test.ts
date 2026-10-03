import assert from 'node:assert/strict'
import { test } from 'node:test'
import { can, canManageUser, changeRole, inviteUser, reactivateUser, removeUser, suspendUser, transferOwnership, validateUsers, type Result, type User } from './users/rules.ts'

const user = (id: string, role: User['role'], status: User['status'] = 'active', extra: Partial<User> = {}): User => ({
  id, name: id, email: `${id}@x.my`, role, status, createdAt: '2026-01-01T00:00:00Z', ...extra,
})
const team = () => [user('o', 'owner'), user('a', 'admin'), user('c', 'accountant'), user('v', 'viewer', 'invited')]
const ok = (r: Result) => (assert.ok(r.ok, r.ok ? '' : r.error), r.ok ? r.users : [])
const err = (r: Result) => (assert.equal(r.ok, false), r.ok ? '' : r.error)

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

test('invite: validates, rejects duplicate emails case-insensitively, never creates an owner', () => {
  const users = team()
  const invited = ok(inviteUser(users, 'a', { name: ' Ana ', email: 'ana@x.my', role: 'viewer' }, '2026-02-01T00:00:00Z', 'n'))
  assert.deepEqual(invited.at(-1), { id: 'n', name: 'Ana', email: 'ana@x.my', role: 'viewer', status: 'invited', createdAt: '2026-02-01T00:00:00Z', invitedAt: '2026-02-01T00:00:00Z' })
  assert.match(err(inviteUser(users, 'a', { name: 'X', email: 'A@X.MY', role: 'viewer' }, 'n', 'n')), /already/)
  assert.match(err(inviteUser(users, 'a', { name: 'X', email: 'nope', role: 'viewer' }, 'n', 'n')), /valid email/)
  assert.match(err(inviteUser(users, 'a', { name: ' ', email: 'q@x.my', role: 'viewer' }, 'n', 'n')), /name/)
  assert.match(err(inviteUser(users, 'a', { name: 'X', email: 'q@x.my', role: 'owner' }, 'n', 'n')), /one owner/)
  assert.match(err(inviteUser(users, 'c', { name: 'X', email: 'q@x.my', role: 'viewer' }, 'n', 'n')), /permission/)
})

test('only users.manage roles can change anyone, and nobody changes themselves', () => {
  const users = team()
  assert.match(err(changeRole(users, 'c', 'v', 'admin')), /permission/)
  assert.match(err(changeRole(users, 'a', 'a', 'viewer')), /own account/)
  assert.equal(ok(changeRole(users, 'a', 'c', 'viewer')).find((u) => u.id === 'c')!.role, 'viewer')
  assert.match(err(changeRole(users, 'a', 'c', 'owner')), /one owner/)
})

test('the owner cannot be demoted, suspended or removed, by anyone', () => {
  const users = team()
  for (const actor of ['o', 'a']) {
    assert.match(err(changeRole(users, actor, 'o', 'viewer')), /owner/)
    assert.match(err(suspendUser(users, actor, 'o')), /owner/)
    assert.match(err(removeUser(users, actor, 'o')), /owner/)
  }
  assert.match(err(removeUser(users, 'o', 'o')), /Transfer ownership/)
  assert.equal(canManageUser(users[1], users[0]), false)
  assert.equal(canManageUser(users[0], users[1]), true)
  assert.equal(canManageUser(users[0], users[0]), false)
})

test('suspend, reactivate and remove', () => {
  const users = team()
  const suspended = ok(suspendUser(users, 'o', 'c'))
  assert.equal(suspended.find((u) => u.id === 'c')!.status, 'suspended')
  assert.equal(ok(reactivateUser(suspended, 'o', 'c')).find((u) => u.id === 'c')!.status, 'invited')
  const seen = users.map((u) => (u.id === 'c' ? { ...u, lastActiveAt: '2026-03-01T00:00:00Z' } : u))
  assert.equal(ok(reactivateUser(ok(suspendUser(seen, 'o', 'c')), 'o', 'c')).find((u) => u.id === 'c')!.status, 'active')
  assert.deepEqual(ok(removeUser(users, 'a', 'v')).map((u) => u.id), ['o', 'a', 'c'])
})

test('transfer ownership keeps exactly one active owner', () => {
  const users = team()
  const moved = ok(transferOwnership(users, 'o', 'a'))
  assert.deepEqual(moved.map((u) => u.role), ['admin', 'owner', 'accountant', 'viewer'])
  assert.ok(validateUsers(moved))
  assert.match(err(transferOwnership(users, 'a', 'c')), /Only the owner/)
  assert.match(err(transferOwnership(users, 'o', 'o')), /other than yourself/)
  assert.match(err(transferOwnership(users, 'o', 'v')), /active/)
  assert.match(err(transferOwnership(users, 'o', 'zzz')), /no longer exists/)
})

test('validateUsers enforces shape and invariants', () => {
  assert.ok(validateUsers(team()))
  assert.equal(validateUsers([]), false)
  assert.equal(validateUsers('x'), false)
  assert.equal(validateUsers([user('o', 'owner'), user('p', 'owner')]), false)
  assert.equal(validateUsers([user('a', 'admin')]), false)
  assert.equal(validateUsers([user('o', 'owner', 'suspended')]), false)
  assert.equal(validateUsers([user('o', 'owner'), user('a', 'admin', 'active', { email: 'O@X.my' })]), false)
  assert.equal(validateUsers([user('o', 'owner'), { ...user('a', 'admin'), role: 'god' }]), false)
})
