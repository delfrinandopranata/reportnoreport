import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardHash, parseRoute } from './route.ts'

const id = '0000000a-0000-0000-0000-0000000000f1'
const all = { roles: true, forms: true }
const none = { roles: false, forms: false }

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
