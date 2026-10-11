import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileName, filePath } from './paths.ts'

const org = '0000000a-0000-0000-0000-000000000001'
const user = '00000000-0000-0000-0000-0000000000a3'
const id = '11111111-1111-1111-1111-111111111111'

test('builds <org>/<user>/<id>-<safe name>', () => {
  assert.equal(filePath(org, user, 'MC scan (1).pdf', id), `${org}/${user}/${id}-MC-scan-1-.pdf`)
})
test('strips path tricks and keeps the name short', () => {
  assert.equal(filePath(org, user, '../../etc/passwd', id), `${org}/${user}/${id}-..-..-etc-passwd`)
  assert.equal(filePath(org, user, 'ñ.png', id), `${org}/${user}/${id}-n-.png`)
  assert.equal(filePath(org, user, '', id), `${org}/${user}/${id}-file`)
  assert.ok(filePath(org, user, 'a'.repeat(300), id).length <= 36 * 2 + 2 + 37 + 80)
})
test('matches the path rule the server checks', () => {
  assert.match(filePath(org, user, 'x y.pdf', id), /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/)
})
test('fileName recovers the display name from a stored path', () => {
  assert.equal(fileName(filePath(org, user, 'note.pdf', id)), 'note.pdf')
  assert.equal(fileName('odd'), 'odd')
})
