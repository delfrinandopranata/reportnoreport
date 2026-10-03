import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rememberReturnTo, takeReturnTo } from './route.ts'

const memory = () => {
  const m = new Map<string, string>()
  return { setItem: (k: string, v: string) => void m.set(k, v), getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) }
}

test('returns the remembered hash once, then the default', () => {
  const s = memory()
  rememberReturnTo('#clients/abc/transactions', s)
  assert.equal(takeReturnTo(s), '#clients/abc/transactions')
  assert.equal(takeReturnTo(s), '#dashboard')
})

test('never returns to auth pages', () => {
  const s = memory()
  rememberReturnTo('#signin', s)
  assert.equal(takeReturnTo(s), '#dashboard')
})

import { isSetPasswordFlow } from './route.ts'

test('isSetPasswordFlow detects flow query, invite and recovery hashes', () => {
  assert.equal(isSetPasswordFlow('?flow=set-password', ''), true)
  assert.equal(isSetPasswordFlow('', '#access_token=x&type=invite'), true)
  assert.equal(isSetPasswordFlow('', '#access_token=x&type=recovery'), true)
  assert.equal(isSetPasswordFlow('?flow=other', '#dashboard'), false)
  assert.equal(isSetPasswordFlow('', '#signin'), false)
})
