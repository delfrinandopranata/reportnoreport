import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const tokens = JSON.parse(read('../design/tokens.json'))
const rawCss = read('../design/tokens.css')
const css = rawCss.replace(/\s+/g, '').toLowerCase()
const bundle = read('../design/components/bundle.css')
const ACCENTS = ['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron']
const THEMES = ['light', 'dark']

/** '#RRGGBB' or 'rgba(r,g,b,a)' → [r, g, b, a] (0–255, alpha 0–1). */
export const parse = (c) => {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1)
  const m = c.replace(/\s/g, '').match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/i)
  if (!m) throw new Error(`Not a colour: ${c}`)
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
}
/** A translucent colour as it looks painted over an opaque base. */
export const over = (top, base) => {
  const [r, g, b, a] = parse(top), [R, G, B] = parse(base)
  return `rgba(${Math.round(r * a + R * (1 - a))},${Math.round(g * a + G * (1 - a))},${Math.round(b * a + B * (1 - a))},1)`
}
const lum = (c) => {
  const [r, g, b] = parse(c).map((v, i) => (i < 3 ? v / 255 : v)).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

const palette = (a, t) => ({ ...tokens.theme[t], ...tokens.accent[a][t] })

test('contrast maths matches WCAG reference values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00')
  assert.equal(contrast('#767676', '#FFFFFF').toFixed(2), '4.54')
  assert.equal(over('rgba(0,0,0,.5)', '#FFFFFF'), 'rgba(128,128,128,1)')
})

test('every accent and theme meets WCAG contrast', () => {
  const problems = []
  for (const a of ACCENTS) for (const t of THEMES) {
    const p = palette(a, t)
    const on = (top, base) => (parse(p[top])[3] < 1 ? over(p[top], p[base]) : p[top])
    const pairs = [
      // [label, foreground, background, minimum]
      ['ink on canvas', p.ink, p.canvas, 4.5], ['ink on surface', p.ink, p.surface, 4.5], ['ink-2 on surface', p['ink-2'], p.surface, 4.5],
      ['ink-3 on canvas', p['ink-3'], p.canvas, 4.5], ['ink-3 on surface', p['ink-3'], p.surface, 4.5], ['ink-3 on field', p['ink-3'], p.field, 4.5],
      ['on-acc on acc start', p['on-acc'], p['acc-a'], 4.5], ['on-acc on acc end', p['on-acc'], p['acc-b'], 4.5],
      ['chip-fg on chip-bg over acc start', p['chip-fg'], parse(p['chip-bg'])[3] < 1 ? over(p['chip-bg'], p['acc-a']) : p['chip-bg'], 4.5],
      ['chip-fg on chip-bg over acc end', p['chip-fg'], parse(p['chip-bg'])[3] < 1 ? over(p['chip-bg'], p['acc-b']) : p['chip-bg'], 4.5],
      ['stamp on surface', p.stamp, p.surface, 4.5], ['stamp on canvas', p.stamp, p.canvas, 4.5], ['link on surface', p.link, p.surface, 4.5],
      ['ok-ink on tint', p['ok-ink'], on('tint', 'surface'), 4.5],
      ['down on surface', p.down, p.surface, 4.5], ['down on down-bg', p.down, on('down-bg', 'surface'), 4.5],
      ['ok on surface', p.ok, p.surface, 4.5], ['ok on ok-bg', p.ok, on('ok-bg', 'surface'), 4.5],
      ['warn on surface', p.warn, p.surface, 4.5], ['warn on warn-bg', p.warn, on('warn-bg', 'surface'), 4.5],
      ['info on surface', p.info, p.surface, 4.5], ['info on info-bg', p.info, on('info-bg', 'surface'), 4.5],
      ['strike on canvas', p.strike, p.canvas, 3], ['focus on canvas', p.focus, p.canvas, 3], ['focus on surface', p.focus, p.surface, 3],
      ['series-1 on surface', p['series-1'], p.surface, 3], ['series-2 on surface', p['ink-3'], p.surface, 3],
      ['edge on field', p.edge, p.field, 3], ['edge on surface', p.edge, p.surface, 3],
    ]
    for (const [label, fg, bg, min] of pairs) {
      const ratio = contrast(fg, bg)
      if (ratio < min) problems.push(`${a}/${t}: ${label} is ${ratio.toFixed(2)} (needs ${min})`)
    }
  }
  assert.deepEqual(problems, [])
})

test('Black & White fills read against the canvas in both themes', () => {
  for (const t of THEMES) {
    const p = palette('bw', t)
    assert.ok(contrast(p['acc-a'], p.canvas) >= 3, `bw/${t}: the accent fill is invisible on the canvas`)
    assert.notEqual(p['acc-a'].toLowerCase(), p.canvas.toLowerCase())
  }
})

test('every accent defines the same accent keys, so none leaks a value from the default accent', () => {
  const accentKeys = (a) => Object.keys(tokens.accent[a].light).filter((k) => !(k in tokens.theme.light)).sort()
  for (const a of ACCENTS) assert.deepEqual(accentKeys(a), accentKeys('midnight'), a)
})

test('tokens.css carries every tokens.json value', () => {
  const bodies = (selector) => [...css.matchAll(new RegExp(`${selector.replace(/[[\]"=]/g, '\\$&')}\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(';')
  const missing = []
  const check = (selector, values) => {
    const body = bodies(selector)
    for (const [k, v] of Object.entries(values)) if (k !== 'label' && !body.includes(`--${k}:${v.replace(/\s+/g, '').toLowerCase()}`)) missing.push(`${selector} --${k}`)
  }
  check('[data-theme="light"]', tokens.theme.light)
  check('[data-theme="dark"]', tokens.theme.dark)
  for (const a of ACCENTS) {
    check(`[data-accent="${a}"]`, tokens.accent[a].light)
    check(`[data-accent="${a}"][data-theme="dark"]`, tokens.accent[a].dark)
  }
  for (const group of ['radius', 'space', 'motion', 'z', 'size', 'opacity', 'breakpoint']) check(':root', Object.fromEntries(Object.entries(tokens.shape[group] ?? tokens[group] ?? {}).map(([k, v]) => [{ radius: 'r-', space: 'space-', motion: '', z: 'z-', size: '', opacity: 'opacity-', breakpoint: 'bp-' }[group] + k, String(v)])))
  assert.deepEqual(missing, [])
})

test('an accent overrides the same tokens in both themes', () => {
  // A neutral overridden only in the light rule (same specificity as [data-theme="dark"]) would leak into dark.
  for (const a of ACCENTS) assert.deepEqual(Object.keys(tokens.accent[a].light).sort(), Object.keys(tokens.accent[a].dark).sort(), a)
})

test('eight accents, each labelled', () => {
  assert.deepEqual(Object.keys(tokens.accent), ACCENTS)
  for (const a of ACCENTS) assert.ok(tokens.accent[a].label, a)
})

test('both themes define the same neutral keys', () => {
  assert.deepEqual(Object.keys(tokens.theme.light).sort(), Object.keys(tokens.theme.dark).sort())
})

test('corners follow the Apple scale: controls 10, cards 14, panels 20, only avatars are circles', () => {
  const r = tokens.shape.radius
  assert.deepEqual([r.control, r['control-sm'], r.card, r.panel], ['10px', '8px', '14px', '20px'])
  for (const [k, v] of Object.entries(r)) if (k !== 'avatar') assert.ok(parseInt(v) <= 20, `${k} is ${v}`)
  assert.equal(r.avatar, '9999px')
  assert.equal(r.chip, '6px') // chips, tags and badges: small-badge corner, never a pill
  assert.match(bundle, /\.rnr-chip, \.rnr-trend \{[^}]*border-radius: var\(--r-chip\)/)
  assert.ok(!/\.page-title|\.dialog-title|\.rnr-pill|\.rnr-kpi\b(?!-)/.test(bundle), 'legacy aliases are removed')
  assert.ok(!('pill' in r) && !('full' in r))
})

test('bundle.css never draws a pill or circle outside the documented marks', () => {
  const round = /border-radius:\s*(50%|9{3,}px|var\(--r-avatar\))/
  const offenders = []
  for (const [, selector, body] of bundle.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (round.test(body) && !/\.rnr-(avatar|radio|dot|notice-dot|spin|pulse|trail)\b|input\[type="radio"\]/.test(selector)) offenders.push(selector.trim().replace(/\s+/g, ' '))
  }
  assert.deepEqual(offenders, [])
})

test('bundle.css reads only tokens: no colour literals', () => {
  const body = bundle.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.deepEqual(body.match(/#[0-9a-fA-F]{3,8}\b|rgba?\((?!var\()/g) ?? [], [])
})

test('bundle.css only uses custom properties that exist', () => {
  const defined = new Set([...(rawCss + bundle).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
  const used = [...bundle.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(used.filter((u) => !defined.has(u)))], [])
})

test('bundle.css puts every rule in a layer, in Tailwind’s order, so utilities win', () => {
  const body = bundle.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(body.trimStart(), /^@layer theme, base, components, utilities;/)
  let depth = 0, start = 0
  const top = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') { if (depth === 0) top.push(body.slice(start, i).trim()); depth++ }
    else if (body[i] === '}') { depth--; if (depth === 0) start = i + 1 }
    else if (body[i] === ';' && depth === 0) start = i + 1
  }
  assert.deepEqual(top.filter((t) => !/^@(layer components|keyframes|font-face)/.test(t)), [])
})

test('the retired modes are gone from the tokens and the bundle', () => {
  assert.ok(!/data-preset|data-style|bw-light|bw-dark|glass|neu-/.test(rawCss + bundle))
  assert.ok(/\[data-density="compact"\]/.test(rawCss) && /\[data-motion="flat"\]/.test(rawCss))
})

test('every component has a README and a preview', () => {
  const dirs = ['Button', 'Field', 'Choice', 'Segmented', 'Tabs', 'FolderCard', 'KpiTile', 'Stamp', 'Badge', 'Avatar', 'DataTable', 'Menu', 'Dialog', 'Toast', 'Steps', 'Progress', 'Skeleton', 'EmptyState', 'Shell', 'TopBar', 'BellPanel', 'PageHeader', 'Charts', 'Canvas', 'FormBuilder', 'AppearancePanel', 'Wordmark', 'Landing', 'Paper', 'Icon', 'Widget']
  const missing = dirs.flatMap((d) => ['README.md', 'preview.html'].map((f) => `${d}/${f}`)).filter((f) => !existsSync(new URL(`../design/components/${f}`, import.meta.url)))
  assert.deepEqual(missing, [])
  assert.ok(!existsSync(new URL('../design/components/Cover', import.meta.url)))
})
