import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bankPayload } from './bankForm.ts'

const form = { name: 'N', bankName: 'B', accountName: 'A', accountNo: '1', isDefaultChecked: false }

test('editing the default account keeps it default', () => {
  const p = bankPayload({ id: 'x', isDefault: true, isActive: true }, form, 3)
  assert.equal(p.isDefault, true)
})
test('editing an inactive account keeps it inactive', () => {
  const p = bankPayload({ id: 'x', isDefault: false, isActive: false }, form, 3)
  assert.equal(p.isActive, false)
  assert.equal(p.isDefault, false)
})
test('ticking default on a non-default account promotes it', () => {
  assert.equal(bankPayload({ id: 'x', isDefault: false, isActive: true }, { ...form, isDefaultChecked: true }, 3).isDefault, true)
})
test('first new account becomes default and active', () => {
  const p = bankPayload(null, form, 0)
  assert.equal(p.isDefault, true)
  assert.equal(p.isActive, true)
})
test('later new account is default only if ticked', () => {
  assert.equal(bankPayload(null, form, 2).isDefault, false)
  assert.equal(bankPayload(null, { ...form, isDefaultChecked: true }, 2).isDefault, true)
})
