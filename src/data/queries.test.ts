import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictMessage } from './conflict.ts'

test('conflict message names who changed it and when', () => {
  assert.equal(conflictMessage('Nur Aisyah', '2026-10-03T07:42:00Z', 'Asia/Kuala_Lumpur'),
    'This client was changed by Nur Aisyah at 3:42 pm. Reload to see their changes.')
})
