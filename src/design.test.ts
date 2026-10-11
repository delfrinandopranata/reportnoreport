import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((n) => {
  const p = `${dir}/${n}`
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p]
})

test('v1 imports the design system from v2/design', () => {
  const css = read('src/index.css')
  for (const f of ['fonts/fonts.css', 'tokens.css', 'components/bundle.css']) assert.ok(css.includes(`@import "../v2/design/${f}"`), f)
  // A copy would redeclare raw token values; v1 only maps names.
  for (const f of walk('src').filter((p) => p.endsWith('.css'))) assert.doesNotMatch(read(f), /--(canvas|surface|ink|acc-a)\s*:\s*#/, f)
})

test('nothing references the retired design-system folder', () => {
  for (const f of [...walk('src'), 'app/index.html', 'index.html', 'CLAUDE.md', 'docs/README.md']) assert.doesNotMatch(read(f), /design-system\//, f)
})

test('fonts are same-origin and the CSP allows them', () => {
  for (const f of ['app/index.html', 'index.html', 'vercel.json', 'src/index.css']) assert.doesNotMatch(read(f), /fonts\.(googleapis|gstatic)\.com/, f)
  assert.match(read('vercel.json'), /font-src 'self'/)
})

const RETIRED = /\b(?:zinc|red|emerald|green|amber|blue|sky|orange|rose|yellow)-\d{2,3}\b|\bdark:[a-z[]|--brand-solid|--color-(?:in|out)\b|\b(?:bg|text|fill|stroke|border)-(?:in|out)\b/
/** Files not yet on Paper that moves. Each screen task deletes its entries; Task 11 requires this list to be empty. */
const LEGACY = new Set<string>([
  'src/ClientProfile.tsx',
  'src/ClientsPage.tsx',
  'src/Dashboard.tsx',
  'src/Statement.tsx',
  'src/attachments/Attachments.tsx',
  'src/checklist/Checklist.tsx',
  'src/clients/AddClient.tsx',
  'src/clients/ClientInfo.tsx',
  'src/contracts/ContractsPage.tsx',
  'src/settings/BankAccounts.tsx',
  'src/settings/BillingPage.tsx',
  'src/settings/SettingsPage.tsx',
  'src/tour/Tour.tsx',
  'src/transfer.tsx',
  'src/users/UsersPage.tsx',
  'src/widgets.tsx',
])

test('no screen uses the retired palette', () => {
  const offenders = walk('src').filter((p) => p.endsWith('.tsx') && !LEGACY.has(p) && RETIRED.test(read(p)))
  assert.deepEqual(offenders, [])
  for (const p of LEGACY) assert.ok(RETIRED.test(read(p)), `${p} is migrated: remove it from LEGACY`)
})
