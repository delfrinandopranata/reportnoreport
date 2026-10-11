import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stoppedBody } from './status.ts'

test('the stopped sentence never doubles the full stop the reason already ends with', () => {
  assert.equal(
    stoppedBody('The role for "Approvers sign off" no longer exists. Ask a workflow manager to choose another.'),
    'Your answers were saved, but the workflow stopped at a later step: The role for "Approvers sign off" no longer exists. Ask a workflow manager to choose another. Ask a workflow manager to fix it, then start a new record.',
  )
  assert.equal(stoppedBody(null), 'Your answers were saved, but the workflow stopped at a later step: a step could not run. Ask a workflow manager to fix it, then start a new record.')
})
