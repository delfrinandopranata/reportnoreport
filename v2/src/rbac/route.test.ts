import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardHash, parseRoute } from './route.ts'

const id = '0000000a-0000-0000-0000-0000000000f1'
const all = { roles: true, forms: true, workflows: true, comms: true, reports: true, reportsManage: true }
const none = { roles: false, forms: false, workflows: false, comms: false, reports: false, reportsManage: false }

test('parses every page', () => {
  assert.deepEqual(parseRoute('#/members'), { page: 'members' })
  assert.deepEqual(parseRoute('#/roles'), { page: 'roles' })
  assert.deepEqual(parseRoute('#/forms'), { page: 'forms' })
  assert.deepEqual(parseRoute(`#/forms/${id}/edit`), { page: 'form-edit', id })
  assert.deepEqual(parseRoute(`#/forms/${id}/fill`), { page: 'form-fill', id })
  assert.deepEqual(parseRoute(`#/forms/${id}/submissions`), { page: 'form-submissions', id })
  assert.deepEqual(parseRoute('#/forms/nope/edit'), { page: 'members' })
})
test('roles hash redirects to members without roles.manage', () => {
  assert.equal(guardHash('#/roles', none), '#/members')
  assert.equal(guardHash('#/roles', all), '#/roles')
})
test('the builder falls back to the fill page without forms.manage', () => {
  assert.equal(guardHash(`#/forms/${id}/edit`, none), `#/forms/${id}/fill`)
  assert.equal(guardHash(`#/forms/${id}/edit`, all), `#/forms/${id}/edit`)
  assert.equal(guardHash('#/forms', none), '#/forms')
})
test('parses workflow, inbox, task, start and record pages', () => {
  assert.deepEqual(parseRoute('#/workflows'), { page: 'workflows' })
  assert.deepEqual(parseRoute(`#/workflows/${id}/edit`), { page: 'workflow-edit', id })
  assert.deepEqual(parseRoute(`#/workflows/${id}/access`), { page: 'workflow-access', id })
  assert.deepEqual(parseRoute('#/inbox'), { page: 'inbox' })
  assert.deepEqual(parseRoute(`#/start/${id}`), { page: 'start', id })
  assert.deepEqual(parseRoute(`#/tasks/${id}`), { page: 'task', id })
  assert.deepEqual(parseRoute('#/records'), { page: 'records' })
  assert.deepEqual(parseRoute(`#/records/${id}`), { page: 'record', id })
  assert.deepEqual(parseRoute('#/records/nope'), { page: 'members' })
  assert.deepEqual(parseRoute('#/workflows/x/edit'), { page: 'members' })
})
test('workflow pages fall back to the inbox without workflows.manage', () => {
  assert.equal(guardHash('#/workflows', none), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/edit`, none), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/access`, none), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/edit`, all), `#/workflows/${id}/edit`)
  assert.equal(guardHash(`#/records/${id}`, none), `#/records/${id}`)
})

test('parses templates, messages and settings pages; comms pages need comms.manage', () => {
  assert.deepEqual(parseRoute('#/templates'), { page: 'templates' })
  assert.deepEqual(parseRoute(`#/templates/${id}`), { page: 'template', id })
  assert.deepEqual(parseRoute('#/messages'), { page: 'messages' })
  assert.deepEqual(parseRoute('#/settings'), { page: 'settings' })
  assert.deepEqual(parseRoute('#/templates/nope'), { page: 'members' })
  assert.equal(guardHash('#/templates', none), '#/inbox')
  assert.equal(guardHash(`#/templates/${id}`, none), '#/inbox')
  assert.equal(guardHash('#/messages', none), '#/inbox')
  assert.equal(guardHash('#/messages', all), '#/messages')
  assert.equal(guardHash('#/settings', none), '#/settings')
})

test('parses report, dashboard and PDF template pages', () => {
  assert.deepEqual(parseRoute('#/dashboard'), { page: 'dashboard' })
  assert.deepEqual(parseRoute('#/reports'), { page: 'reports' })
  assert.deepEqual(parseRoute(`#/reports/${id}`), { page: 'report', id })
  assert.deepEqual(parseRoute(`#/workflows/${id}/report`), { page: 'workflow-report', id })
})
test('report pages need reports.view; the PDF template editor needs reports.manage', () => {
  for (const h of ['#/dashboard', '#/reports', `#/reports/${id}`, `#/workflows/${id}/report`]) assert.equal(guardHash(h, none), '#/inbox')
  const viewer = { ...none, reports: true }
  assert.equal(guardHash(`#/reports/${id}`, viewer), `#/reports/${id}`)
  assert.equal(guardHash(`#/workflows/${id}/report`, viewer), '#/inbox')
  assert.equal(guardHash(`#/workflows/${id}/report`, { ...none, reports: true, reportsManage: true }), `#/workflows/${id}/report`)
})
