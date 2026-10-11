import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventText, eventIcon } from './timeline.ts'
import { LEAVE } from '../../supabase/functions/_shared/workflow/fixture.ts'

const ev = (kind: string, node_id: string | null, detail: Record<string, unknown> = {}) => ({ kind, node_id, detail })

test('people events name who did what on which step', () => {
  assert.equal(eventText(ev('started', 'start'), LEAVE, 'You'), 'You started the record')
  assert.equal(eventText(ev('submitted', 'approve', { outcome: 'approved' }), LEAVE, 'admin@alpha.test'), 'admin@alpha.test approved Manager approval')
  assert.equal(eventText(ev('submitted', 'approve', { outcome: 'rejected' }), LEAVE, null), 'Someone rejected Manager approval')
  assert.equal(eventText(ev('submitted', 'start', { outcome: 'submitted' }), LEAVE, 'You'), 'You submitted Start')
  assert.equal(eventText(ev('claimed', 'approve'), LEAVE, 'You'), 'You claimed Manager approval')
})
test('runtime events say what the workflow did', () => {
  assert.equal(eventText(ev('task', 'approve'), LEAVE, null), 'Waiting for Manager approval')
  assert.equal(eventText(ev('condition', 'long', { outcome: 'yes' }), LEAVE, null), 'Checked “More than 2 days?”: Yes')
  assert.equal(eventText(ev('condition', 'long', { outcome: 'no' }), LEAVE, null), 'Checked “More than 2 days?”: No')
  assert.match(eventText(ev('waiting', 'wait', { runAt: '2026-10-12T12:00:00.000Z' }), LEAVE, null), /^Waiting until 12 Oct 2026/)
  assert.equal(eventText(ev('resumed', 'wait'), LEAVE, null), 'Finished waiting at Wait a day')
  assert.equal(eventText(ev('skipped', 'wait'), LEAVE, null), 'A timer on Wait a day was skipped because the record had moved on')
  assert.equal(eventText(ev('error', 'approve', { message: 'The role for "Manager approval" no longer exists.' }), LEAVE, null), 'Stopped: The role for "Manager approval" no longer exists.')
  assert.equal(eventText(ev('closed', 'rejected', { status: 'rejected' }), LEAVE, null), 'Closed as rejected')
  assert.equal(eventText(ev('closed', 'done', { status: 'done' }), LEAVE, null), 'Closed as done')
})
test('actions that are not carried out yet say so', () => {
  assert.equal(eventText(ev('action', 'approve', { type: 'set_status', label: 'Rejected by manager' }), LEAVE, null), 'Status set to “Rejected by manager”')
  assert.equal(eventText(ev('action', 'approve', { type: 'send_message', status: 'pending' }), LEAVE, null), 'Message not sent yet. Available when Communication ships.')
  assert.equal(eventText(ev('action', 'approve', { type: 'generate_pdf', status: 'pending' }), LEAVE, null), 'PDF not made yet. Available when Reports ship.')
})
test('a deleted step and an unknown event still read', () => {
  assert.equal(eventText(ev('task', 'gone'), LEAVE, null), 'Waiting for A deleted step')
  assert.equal(eventText(ev('mystery', null), LEAVE, null), 'The workflow recorded a step')
})
test('waiting, tasks and pending actions get a clock; errors a stop; closing a tick or a cross', () => {
  assert.equal(eventIcon(ev('waiting', 'wait')), 'clock')
  assert.equal(eventIcon(ev('task', 'approve')), 'clock')
  assert.equal(eventIcon(ev('action', 'approve', { type: 'send_message' })), 'clock')
  assert.equal(eventIcon(ev('action', 'approve', { type: 'set_status', label: 'x' })), null)
  assert.equal(eventIcon(ev('error', 'approve')), 'stop')
  assert.equal(eventIcon(ev('closed', 'done', { status: 'done' })), 'check')
  assert.equal(eventIcon(ev('closed', 'rejected', { status: 'rejected' })), 'x')
  assert.equal(eventIcon(ev('started', 'start')), null)
})
