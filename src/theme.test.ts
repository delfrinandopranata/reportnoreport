import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveTheme } from './theme.ts'

test('resolveTheme: explicit light/dark ignores OS', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('light', false), 'light')
  assert.equal(resolveTheme('dark', true), 'dark')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('resolveTheme: system follows OS', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})
