import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const wf = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')

test('v1 deploy ignores v2 except its design system and points at the ledger subdomain', () => {
  const v1 = wf('deploy.yml')
  assert.doesNotMatch(v1, /paths-ignore/)
  assert.match(v1, /paths:\s*\[\s*'\*\*',\s*'!v2\/\*\*',\s*'v2\/design\/\*\*',\s*'!\.github\/workflows\/deploy-v2\.yml',\s*'!\.github\/workflows\/ci-v2\.yml'\s*\]/)
  assert.match(v1, /APP_URL=https:\/\/ledger\.reportnoreport\.com\/app\//)
  assert.match(v1, /url: https:\/\/ledger\.reportnoreport\.com/)
  assert.doesNotMatch(v1, /APP_URL=https:\/\/reportnoreport\.com/)
  assert.match(v1, /group: production\n/)
})

test('v2 deploy uses only v2 secrets and variables', () => {
  const v2 = wf('deploy-v2.yml')
  const shared = new Set(['VERCEL_TOKEN', 'VERCEL_ORG_ID'])
  const refs = [...v2.matchAll(/\$\{\{\s*(?:secrets|vars)\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])
  assert.ok(refs.length > 5)
  for (const name of refs) assert.ok(shared.has(name) || /(^|_)V2(_|$)/.test(name), `${name} is not namespaced for v2`)
  assert.match(v2, /environment:\s*(?:\n\s*name:\s*)?production-v2/)
  assert.match(v2, /group: production-v2/)
  assert.match(v2, /paths:\s*\[\s*'v2\/\*\*'/)
  assert.match(v2, /uses: \.\/\.github\/workflows\/ci-v2\.yml/)
  assert.match(v2, /APP_URL=https:\/\/reportnoreport\.com\/app\//)
  assert.match(v2, /vercel deploy --prebuilt --prod/)
})

test('ci-v2 can be called by the deploy and no longer runs twice on main', () => {
  const ci = wf('ci-v2.yml')
  assert.match(ci, /workflow_call:/)
  assert.doesNotMatch(ci, /^\s*push:/m)
})
