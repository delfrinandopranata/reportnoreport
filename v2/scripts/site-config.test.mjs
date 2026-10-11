import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))

test('vercel.json: /app -> /app/ redirect does not fight trailingSlash', () => {
  const redirectsToSlash = vercel.redirects.some((r) => r.source === '/app' && r.destination === '/app/')
  assert.ok(!(redirectsToSlash && vercel.trailingSlash === false), 'trailingSlash:false would 308 /app/ back to /app')
})

const forward = (() => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const src = html.match(/<script>\s*\/\/ Old app bookmarks[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '')
  return (hash, search = '') => {
    let to = null
    new Function('location', src)({ hash, search, replace: (u) => { to = u } })
    return to
  }
})()

test('landing forwards old hash routes and auth callbacks to /app/', () => {
  assert.equal(forward('#/members'), '/app/#/members')
  assert.equal(forward('#access_token=abc&type=signup'), '/app/#access_token=abc&type=signup')
  assert.equal(forward('#error=access_denied'), '/app/#error=access_denied')
  assert.equal(forward('', '?code=xyz'), '/app/?code=xyz')
  assert.equal(forward('#top'), null)
  assert.equal(forward(''), null)
})
