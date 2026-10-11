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
test('form messages', () => {
  assert.equal(
    friendlyError({ code: '23503', message: 'update or delete on table "forms" violates foreign key constraint "form_submissions_form_id_org_id_fkey" on table "form_submissions"' }),
    'This form has submissions, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.',
  )
  assert.equal(friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "forms"' }), 'You do not have permission to do that.')
})
test('workflow messages', () => {
  assert.equal(
    friendlyError({ code: '23503', message: 'update or delete on table "workflows" violates foreign key constraint "records_workflow_id_org_id_fkey" on table "records"' }),
    'This workflow has records, so it cannot be deleted. Keep it, or rename it so people know it is no longer used.',
  )
  assert.equal(
    friendlyError({ code: 'P0001', message: 'This task was already claimed or completed.' }),
    'Someone else claimed this task first, or it is already done. Check your inbox for what is left.',
  )
})

test('communication messages', () => {
  assert.equal(friendlyError({ code: 'P0001', message: 'Only failed messages can be retried.' }),
    'Only failed messages can be retried. The list now shows the latest status.')
  assert.equal(friendlyError({ code: 'P0001', message: 'A template cannot change its type.' }),
    'A template cannot change its type. Create a new template instead.')
})

test('report and PDF messages', () => {
  assert.equal(friendlyError({ message: 'This workflow has no report template yet.' }), 'This workflow has no PDF template yet. Ask a reports manager to set one up.')
  assert.equal(friendlyError({ message: 'The dashboard changed. Reload to see the latest layout.' }), 'The dashboard changed. Reload to see the latest layout.')
})

test('campaign messages read as sentences', () => {
  const cases: [string, string][] = [
    ['Only a draft campaign can be scheduled.', 'This campaign is no longer a draft. The page now shows its latest state.'],
    ['Choose a message template before sending.', 'Choose a message template before sending.'],
    ['Choose who receives this campaign before sending.', 'Choose who receives this campaign before sending.'],
    ['Choose a time in the future.', 'Choose a time in the future.'],
    ['Choose a time within the next year.', 'Choose a time within the next year.'],
    ['This campaign has started sending and cannot be changed.', 'This campaign has started sending and cannot be changed. The page now shows its latest state.'],
    ['You can only link a workflow whose records you can all see.', 'You can only link a workflow whose records you can all see. Choose another, or ask an admin for access.'],
  ]
  for (const [message, sentence] of cases) assert.equal(friendlyError({ message }), sentence)
})
