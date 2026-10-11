import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewContext } from './preview.ts'
import { render } from '../../supabase/functions/_shared/comms/render.ts'

const who = { orgName: 'Alpha School', myName: 'admin@alpha.test', appUrl: 'http://localhost:5179/app/' }

test('a chosen record fills the record variables and its link', () => {
  const c = previewContext({ id: 'r1', title: 'Leave: Ada', data: { days: 3 } }, who)
  const r = render({ subject: '{{record.title}}', body: '{{record.data.days}} {{link.record}} {{recipient.name}} {{org.name}}' }, c)
  assert.equal(r.subject, 'Leave: Ada')
  assert.equal(r.text, '3 http://localhost:5179/app/#/records/r1 admin@alpha.test Alpha School')
})
test('with no record the preview still renders, with a placeholder title and empty answers', () => {
  const r = render({ subject: '{{record.title}}', body: '[{{record.data.days}}] {{link.task}}' }, previewContext(null, who))
  assert.equal(r.subject, 'Example record')
  assert.equal(r.text, '[] http://localhost:5179/app/#/inbox')
})
