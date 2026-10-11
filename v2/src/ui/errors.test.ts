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
