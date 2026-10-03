import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readEnv } from './supabase.ts'

test('readEnv returns url and anon key', () => {
  assert.deepEqual(readEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'abc' }), {
    url: 'http://127.0.0.1:54321',
    anonKey: 'abc',
  })
})

test('readEnv names every missing variable', () => {
  assert.throws(() => readEnv({}), /VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
})

test('readEnv refuses a service-role key in the browser', () => {
  const serviceJwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: serviceJwt }), /service-role/)
})

const url = 'http://x'

test('readEnv refuses a new-format secret key', () => {
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' }), /Refusing to start: a service-role\/secret key/)
})

test('readEnv accepts a publishable key', () => {
  assert.equal(readEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc' }).anonKey, 'sb_publishable_abc')
})

test('readEnv explains a malformed JWT-shaped key', () => {
  assert.throws(() => readEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'a.!!!.c' }), /^Error: VITE_SUPABASE_ANON_KEY is not a valid Supabase key$/)
})
