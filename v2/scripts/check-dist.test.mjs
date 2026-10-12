// scripts/check-dist.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSecrets, findMissingAlt, findPlaceholders, findExternalFonts, internalRefs, resolveRef } from './check-dist.mjs'

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig_abc`

test('flags real service-role JWTs and secret keys, not the words', () => {
  assert.deepEqual(findSecrets(`k="${jwt('service_role')}"`), ['service_role JWT'])
  assert.deepEqual(findSecrets('x sb_secret_abcdefghij123 y'), ['sb_secret_ key'])
  assert.deepEqual(findSecrets(`k="${jwt('anon')}"`), [])
  assert.deepEqual(findSecrets('"Refusing: a service-role/secret key", "service_role", "sb_secret_"'), [])
})

test('flags <img> without alt, accepts alt=""', () => {
  assert.deepEqual(findMissingAlt('<img src="/a.png"><img src="/b.png" alt="">'), ['<img src="/a.png">'])
  assert.deepEqual(findMissingAlt('<img alt="Logo" src="/c.png">'), [])
})

test('flags leftover placeholders but not markdown-ish brackets in code', () => {
  assert.deepEqual(findPlaceholders('Governed by [Governing law].'), ['[Governing law]'])
  assert.deepEqual(findPlaceholders('[TBD] and [Company name]'), ['[TBD]', '[Company name]'])
  assert.deepEqual(findPlaceholders('arr[0] and [data-theme="dark"]'), [])
})

test('collects internal href/src only', () => {
  const html = '<a href="/privacy">p</a><a href="https://x.com">x</a><a href="mailto:a@b.c">m</a><a href="#top">t</a><link href="/assets/s.css"><script src="/consent.js"></script>'
  assert.deepEqual(internalRefs(html), ['/privacy', '/assets/s.css', '/consent.js'])
})

test('resolves clean URLs, directories and hashes', () => {
  const files = new Set(['privacy.html', 'app/index.html', 'index.html', 'consent.js'])
  const exists = (p) => files.has(p)
  assert.equal(resolveRef('/privacy', 'index.html', exists), true)
  assert.equal(resolveRef('/app/', 'index.html', exists), true)
  assert.equal(resolveRef('/app#/members', 'index.html', exists), true)
  assert.equal(resolveRef('/', 'privacy.html', exists), true)
  assert.equal(resolveRef('/consent.js', 'index.html', exists), true)
  assert.equal(resolveRef('/pricing', 'index.html', exists), false)
})

test('external font hosts are refused', () => {
  assert.deepEqual(findExternalFonts('<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">'),
    ['https://fonts.googleapis.com/css2?family=Inter&display=swap'])
  assert.deepEqual(findExternalFonts('@font-face{src:url(https://fonts.gstatic.com/s/inter/v1.woff2)}'), ['https://fonts.gstatic.com/s/inter/v1.woff2'])
  assert.deepEqual(findExternalFonts('@font-face{src:url(/assets/newsreader-latin-opsz-normal-AbC123.woff2)}'), [])
})
