import { assertEquals } from 'jsr:@std/assert@1'
import { isSuperAdmin, validateCreateFirm, extendTrialEnd, validateSettings, isValidUuid, type ProfileRow } from './rules.ts'

Deno.test('isSuperAdmin rejects non-super-admin', () => {
  const profile: ProfileRow = { id: 'p1', firm_id: 'f1', is_super_admin: false }
  assertEquals(isSuperAdmin(profile), false)
})

Deno.test('isSuperAdmin accepts super-admin', () => {
  const profile: ProfileRow = { id: 'p1', firm_id: null, is_super_admin: true }
  assertEquals(isSuperAdmin(profile), true)
})

Deno.test('isSuperAdmin rejects null profile', () => {
  assertEquals(isSuperAdmin(null), false)
})

Deno.test('validateCreateFirm rejects missing name', () => {
  const error = validateCreateFirm({ owner_email: 'test@example.com', currency: 'MYR', start: 'trial' })
  assertEquals(error, 'Enter the firm name.')
})

Deno.test('validateCreateFirm rejects blank name', () => {
  const error = validateCreateFirm({ name: '  ', owner_email: 'test@example.com', currency: 'MYR', start: 'trial' })
  assertEquals(error, 'Enter the firm name.')
})

Deno.test('validateCreateFirm rejects invalid email', () => {
  const error = validateCreateFirm({ name: 'Test Co', owner_name: 'John Doe', owner_email: 'notanemail', currency: 'MYR', start: 'trial' })
  assertEquals(error, 'Enter a valid email address.')
})

Deno.test('validateCreateFirm rejects invalid currency', () => {
  const error = validateCreateFirm({ name: 'Test Co', owner_name: 'John Doe', owner_email: 'test@example.com', currency: 'EUR', start: 'trial' })
  assertEquals(error, 'Choose MYR, SGD or USD.')
})

Deno.test('validateCreateFirm rejects invalid start', () => {
  const error = validateCreateFirm({ name: 'Test Co', owner_name: 'John Doe', owner_email: 'test@example.com', currency: 'MYR', start: 'invalid' })
  assertEquals(error, 'Choose complimentary or trial.')
})

Deno.test('validateCreateFirm rejects missing owner_name', () => {
  const error = validateCreateFirm({ name: 'Test Co', owner_email: 'test@example.com', currency: 'MYR', start: 'trial' })
  assertEquals(error, 'Enter the owner name.')
})

Deno.test('validateCreateFirm rejects blank owner_name', () => {
  const error = validateCreateFirm({ name: 'Test Co', owner_name: '  ', owner_email: 'test@example.com', currency: 'MYR', start: 'trial' })
  assertEquals(error, 'Enter the owner name.')
})

Deno.test('validateCreateFirm accepts valid body', () => {
  const error = validateCreateFirm({ name: 'Test Co', owner_name: 'John Doe', owner_email: 'test@example.com', currency: 'MYR', start: 'trial' })
  assertEquals(error, null)
})

Deno.test('isValidUuid accepts valid UUIDs', () => {
  assertEquals(isValidUuid('0000000a-0000-0000-0000-000000000001'), true)
  assertEquals(isValidUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true)
})

Deno.test('isValidUuid rejects invalid UUIDs', () => {
  assertEquals(isValidUuid('not-a-uuid'), false)
  assertEquals(isValidUuid('f47ac10b'), false)
  assertEquals(isValidUuid(''), false)
  assertEquals(isValidUuid(123), false)
})

Deno.test('extendTrialEnd from null uses now', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  const result = extendTrialEnd(null, now, 7)
  assertEquals(result, '2026-10-10T12:00:00.000Z')
})

Deno.test('extendTrialEnd from past date uses now', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  const past = '2026-09-01T00:00:00.000Z'
  const result = extendTrialEnd(past, now, 14)
  assertEquals(result, '2026-10-17T12:00:00.000Z')
})

Deno.test('extendTrialEnd from future date adds to it', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  const future = '2026-10-10T00:00:00.000Z'
  const result = extendTrialEnd(future, now, 7)
  assertEquals(result, '2026-10-17T00:00:00.000Z')
})

Deno.test('validateSettings accepts undefined fields', () => {
  const error = validateSettings({})
  assertEquals(error, null)
})

Deno.test('validateSettings rejects invalid firm_cap', () => {
  const error = validateSettings({ firm_cap: 1001 })
  assertEquals(error, 'Firm cap must be 0–1000.')
})

Deno.test('validateSettings rejects invalid trial_days', () => {
  const error = validateSettings({ trial_days: 0 })
  assertEquals(error, 'Trial days must be 1–365.')
})

Deno.test('validateSettings accepts valid settings', () => {
  const error = validateSettings({ firm_cap: 100, trial_days: 14 })
  assertEquals(error, null)
})
