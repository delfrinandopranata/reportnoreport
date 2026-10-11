// Writes design/tokens.css from design/tokens.json. tokens.json is the source; run `node scripts/build-tokens.mjs` after editing it.
// scripts/tokens.test.mjs fails if the two drift or a combination loses contrast.
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../design/', import.meta.url)
const t = JSON.parse(readFileSync(new URL('tokens.json', root), 'utf8'))
const decl = (o) => Object.entries(o).filter(([k]) => k !== 'label').map(([k, v]) => `  --${k}: ${v};`).join('\n')
const block = (sel, o, extra = '') => `${sel} {\n${decl(o)}${extra ? `\n${extra}` : ''}\n}\n`

const derivedTheme = (scheme) => `  color-scheme: ${scheme};\n  --series-2: var(--ink-3);\n  --chart-grid: var(--soft);\n  --hover: var(--soft);`
const derivedAccent = '  --acc: linear-gradient(120deg, var(--acc-a), var(--acc-b));'

let css = `/* ReportNoReport v2 design tokens: "Paper that moves". GENERATED from tokens.json by scripts/build-tokens.mjs; do not edit by hand.
   Pre-paint attributes on <html>: data-theme="light|dark" data-accent="midnight|ocean|bw|graphite|fern|rosewood|iris|saffron"
   data-density="comfortable|compact" data-motion="full|flat". The selectors are plain attribute selectors, so any element can carry them. */

/* ---------- theme (neutrals) ---------- */
${block(':root, [data-theme="light"]', t.theme.light, derivedTheme('light'))}
${block('[data-theme="dark"]', t.theme.dark, derivedTheme('dark'))}
/* ---------- accents: each declared for light and for dark; Black & White and Rosewood also override neutrals, in both ---------- */
`
for (const [name, a] of Object.entries(t.accent)) {
  css += block(name === 'midnight' ? `:root, [data-accent="${name}"]` : `[data-accent="${name}"]`, a.light, derivedAccent)
  css += block(`[data-accent="${name}"][data-theme="dark"]`, a.dark, derivedAccent)
}

const family = Object.fromEntries(Object.entries(t.type.family).map(([k, v]) => [`font-${k}`, v]))
const scale = {}
for (const [n, s] of Object.entries(t.type.scale)) {
  scale[`type-${n}`] = `${s.weight} ${s.size}/${s.line} var(--font-${s.family})`
  scale[`tracking-${n}`] = s.tracking
}
const prefixed = (prefix, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [prefix + k, v]))

css += `
/* ---------- type, shape, space, motion, layers, sizes ---------- */
:root {
${decl({ ...family, ...scale })}
${decl(prefixed('r-', t.shape.radius))}
${decl(prefixed('space-', t.shape.space))}
${decl(t.motion)}
${decl(prefixed('z-', t.z))}
${decl(t.size)}
${decl(prefixed('opacity-', t.opacity))}
${decl(prefixed('bp-', t.breakpoint))}
  --r-ctl: var(--r-control);
  --r-track: var(--r-card);
  --ctl-h: var(--control-h);
  --field-h: var(--input-h);
  --card-pad: var(--space-5);
  --row-pad: var(--space-3);
  --t: var(--t-fast);
  --lift: -2px;
}

/* Density is the one mode kept from v1. Compact tightens controls and rows; coarse pointers always get 44px targets. */
[data-density="compact"] {
  --r-ctl: var(--r-control-sm);
  --r-track: 12px;
  --ctl-h: 36px;
  --field-h: 40px;
  --card-pad: var(--space-4);
  --row-pad: var(--space-2);
}
@media (pointer: coarse) {
  :root, [data-density="compact"] { --ctl-h: var(--touch); --field-h: var(--input-h); }
}

/* Motion is not a person's setting: flat whenever the OS asks for reduced motion (set before paint), otherwise full. */
[data-motion="flat"] {
  --t-fast: 0ms; --t-base: 0ms; --t-slow: 0ms; --t-bars: 0ms; --t-stagger: 0ms; --t: 0ms; --lift: 0px;
}
@media (prefers-reduced-motion: reduce) {
  :root, [data-motion] { --t-fast: 0ms; --t-base: 0ms; --t-slow: 0ms; --t-bars: 0ms; --t-stagger: 0ms; --t: 0ms; --lift: 0px; }
}
`
writeFileSync(new URL('tokens.css', root), css)
console.log(`design/tokens.css written (${css.length} bytes)`)
