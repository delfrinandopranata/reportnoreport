// scripts/check-dist.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSecrets, findMissingAlt, findPlaceholders, internalRefs, resolveRef } from './check-dist.mjs'

test('flags service-role and secret keys', () => {
  assert.deepEqual(findSecrets('a "role":"service_role" b'), ['service_role'])
  assert.deepEqual(findSecrets('x sb_secret_abc123 y'), ['sb_secret_'])
  assert.deepEqual(findSecrets('anon key only'), [])
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
