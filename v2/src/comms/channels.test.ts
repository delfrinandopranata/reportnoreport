import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channelLabel } from './channels.ts'

test('an invite is only ever emailed; other templates say email plus in-app', () => {
  assert.equal(channelLabel('invite', 'email'), 'Email')
  assert.equal(channelLabel('invite', 'in_app'), 'Email')
  assert.equal(channelLabel('task_assigned', 'email'), 'Email and in-app')
  assert.equal(channelLabel('custom', 'in_app'), 'In-app only')
})
