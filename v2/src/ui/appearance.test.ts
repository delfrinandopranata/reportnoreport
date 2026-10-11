import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACCENTS, DEFAULT_APPEARANCE, htmlAttrs, readAppearance, sameAppearance } from './appearance.ts'

test('a valid stored appearance is kept', () => {
  assert.deepEqual(readAppearance({ theme: 'dark', accent: 'saffron', density: 'compact' }), { theme: 'dark', accent: 'saffron', density: 'compact' })
  assert.equal(ACCENTS.length, 8)
})

test('unknown or old values fall back to the defaults', () => {
  for (const raw of [null, undefined, 'dark', 42, [], { theme: 'blue', accent: 'forest', density: 'tiny' }, { preset: 'ocean', style: 'glass', bw: true, motion: 'flat' }]) {
    assert.deepEqual(readAppearance(raw), DEFAULT_APPEARANCE, JSON.stringify(raw))
  }
  assert.deepEqual(readAppearance({ accent: 'iris' }), { ...DEFAULT_APPEARANCE, accent: 'iris' })
})

test('system follows the OS; reduced motion is always flat', () => {
  const sys = { ...DEFAULT_APPEARANCE, theme: 'system' as const }
  assert.equal(htmlAttrs(sys, true, false).theme, 'dark')
  assert.equal(htmlAttrs(sys, false, false).theme, 'light')
  assert.equal(htmlAttrs({ ...sys, theme: 'light' }, true, false).theme, 'light')
  assert.equal(htmlAttrs(sys, false, true).motion, 'flat')
  assert.equal(htmlAttrs(sys, false, false).motion, 'full')
  assert.ok(sameAppearance(DEFAULT_APPEARANCE, { ...DEFAULT_APPEARANCE }))
  assert.ok(!sameAppearance(DEFAULT_APPEARANCE, { ...DEFAULT_APPEARANCE, accent: 'fern' }))
})

/** Runs an inline <script> from an HTML file against a fake document, storage and matchMedia. */
const runPrePaint = (file: string, marker: RegExp, stored: string | null, dark: boolean, reduce: boolean) => {
  const html = readFileSync(new URL(file, import.meta.url), 'utf8')
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => marker.test(s))
  assert.ok(src, `no pre-paint script in ${file}`)
  const dataset: Record<string, string> = {}
  const localStorage = { getItem: () => stored }
  const matchMedia = (q: string) => ({ matches: q.includes('dark') ? dark : q.includes('reduced-motion') ? reduce : false })
  new Function('document', 'localStorage', 'matchMedia', src)({ documentElement: { dataset } }, localStorage, matchMedia)
  return dataset
}

test('the app pre-paint script sets the same attributes as htmlAttrs', () => {
  const cases: [string | null, boolean, boolean][] = [
    [null, true, false], [JSON.stringify({ theme: 'light', accent: 'bw', density: 'compact' }), true, true],
    [JSON.stringify({ theme: 'system', accent: 'ocean' }), false, false], ['{not json', true, false],
    [JSON.stringify({ theme: 'neon', accent: 'forest', density: 9 }), false, true],
    ['null', true, false], ['[]', false, false],
  ]
  for (const [stored, dark, reduce] of cases) {
    let parsed: unknown = {}
    try { parsed = JSON.parse(stored ?? '{}') } catch { /* garbage stays {} */ }
    assert.deepEqual(runPrePaint('../../app/index.html', /rnr\.appearance/, stored, dark, reduce),
      { ...htmlAttrs(readAppearance(parsed), dark, reduce) }, String(stored))
  }
})
