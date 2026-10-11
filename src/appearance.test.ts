import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACCENTS, APPEARANCE_KEY, htmlAttrs, readAppearance, STORAGE_KEY } from './appearance.ts'

const runPrePaint = (stored: string | null, dark: boolean, reduce: boolean) => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('rnr.appearance'))
  assert.ok(src, 'no pre-paint script in app/index.html')
  const dataset: Record<string, string> = {}
  const matchMedia = (q: string) => ({ matches: q.includes('dark') ? dark : q.includes('reduced-motion') ? reduce : false })
  new Function('document', 'localStorage', 'matchMedia', src)({ documentElement: { dataset } }, { getItem: () => stored }, matchMedia)
  return dataset
}

test('the v1 pre-paint script sets the same attributes as htmlAttrs', () => {
  const samples = [null, '', 'not json', '42', '[]', '{"theme":"dark","accent":"saffron","density":"compact"}',
    '{"theme":"system","accent":"bw"}', '{"theme":"blue","accent":"forest"}', '{"preset":"ocean","style":"glass"}']
  for (const stored of samples) for (const dark of [true, false]) for (const reduce of [true, false]) {
    let parsed: unknown = null
    try { parsed = JSON.parse(stored || '{}') } catch { /* garbage falls back */ }
    assert.deepEqual({ ...runPrePaint(stored, dark, reduce) }, { ...htmlAttrs(readAppearance(parsed), dark, reduce) }, `${stored} dark=${dark} reduce=${reduce}`)
  }
})

test('v1 shares v2 storage and accent list', () => {
  assert.equal(STORAGE_KEY, 'rnr.appearance')
  assert.equal(APPEARANCE_KEY, 'appearance')
  assert.equal(ACCENTS.length, 8)
})
