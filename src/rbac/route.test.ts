import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardHash } from './route.ts'

test('roles hash redirects to members without roles.manage', () => {
  assert.equal(guardHash('#/roles', false), '#/members')
})
test('roles hash is kept with roles.manage; other hashes untouched', () => {
  assert.equal(guardHash('#/roles', true), '#/roles')
  assert.equal(guardHash('#/members', false), '#/members')
})
