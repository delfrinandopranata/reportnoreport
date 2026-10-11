import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audienceText, channelWord, recipientStatus } from './labels.ts'

const names = { roles: new Map([['r1', 'Member']]), reports: new Map([['p1', 'Leave requests']]), campaigns: new Map([['c1', 'Term starts']]), fields: new Map([['email', 'Contact email']]), workflow: 'Leave approval' }

test('the audience reads as a sentence for every kind', () => {
  assert.equal(audienceText({ kind: 'role', roleId: 'r1' }, names), 'Role: Member')
  assert.equal(audienceText({ kind: 'role', roleId: 'gone' }, names), 'Role: a role that no longer exists')
  assert.equal(audienceText({ kind: 'report', reportId: 'p1', to: 'starter' }, names), 'Report: Leave requests, to the person who started each record')
  assert.equal(audienceText({ kind: 'report', reportId: 'p1', to: { field: 'email' } }, names), 'Report: Leave requests, to the address in Contact email')
  assert.equal(audienceText({ kind: 'followup', campaignId: 'c1', who: 'not_opened' }, names), 'Follow-up: people who did not open Term starts')
  assert.equal(audienceText({ kind: 'followup', campaignId: 'c1', who: 'not_completed' }, names), 'Follow-up: people who have not finished Leave approval')
  assert.equal(audienceText(null, names), 'Nobody chosen yet')
})

test('channels and recipient statuses use the words of the Messages page', () => {
  assert.equal(channelWord('email'), 'Email')
  assert.equal(channelWord('in_app'), 'In-app notice')
  assert.equal(channelWord(null), 'Email')
  const row = { id: '1', recipient_email: 'a@x.test', status: 'queued', error: null, delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null }
  assert.equal(recipientStatus(row), 'queued')
  assert.equal(recipientStatus({ ...row, status: 'sent', bounced_at: '2026-10-12T00:00:00Z' }), 'bounced')
  assert.equal(recipientStatus({ ...row, status: 'failed' }), 'failed')
})

