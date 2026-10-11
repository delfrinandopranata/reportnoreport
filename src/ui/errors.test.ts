import { test } from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError, FALLBACK } from './errors.ts'

test('owner removal and invalid roles guards are mapped', () => {
  assert.equal(friendlyError({ message: 'Only an Owner can remove an Owner.' }), 'Only an Owner can remove an Owner.')
  assert.equal(friendlyError({ message: 'Invalid roles.' }), 'Those roles are not valid for this organisation. Reload the page and try again.')
})
test('unknown messages fall back', () => {
  assert.equal(friendlyError({ message: 'boom' }), FALLBACK)
})
