import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEnv } from './readEnv.ts'

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role }))}.y`

test('returns url and key', () => {
  assert.deepEqual(readEnv({ VITE_SUPABASE_URL: 'http://a', VITE_SUPABASE_ANON_KEY: jwt('anon') }),
    { url: 'http://a', anonKey: jwt('anon') })
})
test('names missing variables', () => {
  assert.throws(() => readEnv({}), /VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
})
test('refuses a service-role key', () => {
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: jwt('service_role') }), /Refusing/)
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' }), /Refusing/)
})
