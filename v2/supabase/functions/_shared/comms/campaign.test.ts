import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_AUDIENCE, NOBODY, NO_STATS, TOO_BIG, campaignTemplateIssue, campaignTiles, checkUnsubscribe, excludedText, pct, pctText,
  planRecipients, readAudience, readUnsubscribeConfig, recipientCsv, unsubscribeLink, withFooter, type Person,
} from './campaign.ts'

const ROLE = '0000000a-0000-0000-0000-00000000a001'
const person = (i: number): Person => ({ userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `p${i}@alpha.test`, name: `Person ${i}` })
const people = (n: number) => Array.from({ length: n }, (_, i) => person(i))
const NONE = new Set<string>()

test('reads the three audience kinds and refuses anything else', () => {
  assert.deepEqual(readAudience({ kind: 'role', roleId: ROLE }), { kind: 'role', roleId: ROLE })
  assert.deepEqual(readAudience({ kind: 'report', reportId: ROLE, to: 'starter' }), { kind: 'report', reportId: ROLE, to: 'starter' })
  assert.deepEqual(readAudience({ kind: 'report', reportId: ROLE, to: { field: 'email' } }), { kind: 'report', reportId: ROLE, to: { field: 'email' } })
  assert.deepEqual(readAudience({ kind: 'followup', campaignId: ROLE, who: 'not_opened' }), { kind: 'followup', campaignId: ROLE, who: 'not_opened' })
  for (const bad of [null, [], {}, { kind: 'role' }, { kind: 'role', roleId: 'x' }, { kind: 'role', roleId: ROLE, extra: 1 },
    { kind: 'report', reportId: ROLE, to: { field: 'Bad Key' } }, { kind: 'report', reportId: ROLE }, { kind: 'followup', campaignId: ROLE, who: 'all' },
    { kind: 'everyone' }]) assert.equal(readAudience(bad), null)
})

test('10,000 people plan exactly and 10,001 are refused', () => {
  const ok = planRecipients({ people: people(MAX_AUDIENCE), emails: [], noEmail: 0 }, NONE, 'email')
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.list.length, 10_000)
  assert.equal(ok.ok && new Set(ok.list.map((r) => r.email)).size, 10_000)
  assert.deepEqual(planRecipients({ people: people(MAX_AUDIENCE + 1), emails: [], noEmail: 0 }, NONE, 'email'), { ok: false, error: TOO_BIG })
})

test('opted-out, duplicate and unusable addresses are left out and counted', () => {
  const found = { people: [person(1), person(2), { ...person(3), email: 'P1@ALPHA.TEST' }], emails: ['p2@alpha.test', 'raw@example.test', 'not an email', ' Raw@Example.test '], noEmail: 2 }
  const plan = planRecipients(found, new Set(['p2@alpha.test']), 'email')
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.deepEqual(plan.list.map((r) => [r.userId, r.email]), [[person(1).userId, 'p1@alpha.test'], [null, 'raw@example.test']])
  assert.deepEqual(plan.excluded, { unsubscribed: 1, duplicate: 3, noEmail: 3, noAccount: 0 })
  // Nobody vanishes: everyone found is either on the list or counted as left out.
  const total = found.people.length + found.emails.length + found.noEmail
  assert.equal(plan.list.length + Object.values(plan.excluded).reduce((a, b) => a + b, 0), total)
})

test('in-app campaigns leave out addresses with no account and ignore opt-outs', () => {
  const plan = planRecipients({ people: [person(1)], emails: ['raw@example.test'], noEmail: 0 }, new Set(['p1@alpha.test']), 'in_app')
  assert.deepEqual(plan.ok && [plan.list.map((r) => r.email), plan.excluded], [['p1@alpha.test'], { unsubscribed: 0, duplicate: 0, noEmail: 0, noAccount: 1 }])
})

test('nobody left is refused with a sentence', () => {
  assert.deepEqual(planRecipients({ people: [person(1)], emails: [], noEmail: 0 }, new Set(['p1@alpha.test']), 'email'), { ok: false, error: NOBODY })
  assert.deepEqual(planRecipients({ people: [], emails: [], noEmail: 0 }, NONE, 'email'), { ok: false, error: NOBODY })
})

test('percentages are null when the denominator is zero', () => {
  assert.equal(pct(0, 0), null)
  assert.equal(pct(5, 0), null)
  assert.equal(pct(1, 3), 33.3)
  assert.equal(pct(2, 2), 100)
  assert.equal(pctText(null), 'No data yet')
  assert.equal(pctText(33.3), '33.3%')
  const tiles = campaignTiles({ ...NO_STATS, recipients: 3, sent: 3 }, 'email')
  assert.deepEqual(tiles.map((t) => [t.label, t.value]), [
    ['Recipients', '3'], ['Delivered', '0%'], ['Opened', 'No data yet'], ['Clicked', 'No data yet'], ['Bounced and failed', '0 · 0']])
  assert.deepEqual(campaignTiles(NO_STATS, 'in_app').map((t) => t.value), ['0', 'No data yet'])
})

test('tiles: opened and clicked are shares of delivered, and sending shows progress', () => {
  const s = { ...NO_STATS, recipients: 10_000, queued: 5_800, sent: 4_150, failed: 50, delivered: 4_000, opened: 1_000, clicked: 250, bounced: 12 }
  assert.deepEqual(campaignTiles(s, 'email').map((t) => [t.value, t.caption]), [
    ['10,000', '4,200 of 10,000 sent so far'], ['40%', '4,000 of 10,000'], ['25%', '1,000 of 4,000 delivered, approximate'],
    ['6.3%', '250 of 4,000 delivered'], ['12 · 50', '12 bounced, 50 failed']])
  assert.deepEqual(campaignTiles({ ...NO_STATS, recipients: 4, sent: 4, opened: 1 }, 'in_app').map((t) => [t.label, t.value, t.caption]),
    [['Recipients', '4', 'People sent an in-app notice'], ['Read', '25%', '1 of 4 read it']])
})

test('excludedText says who was left out, or nothing', () => {
  assert.equal(excludedText({ unsubscribed: 0, duplicate: 0, noEmail: 0, noAccount: 0 }), null)
  assert.equal(excludedText({}), null)
  assert.equal(excludedText({ unsubscribed: 2, duplicate: 1, noEmail: 1, noAccount: 0 }),
    '4 people were left out: 2 unsubscribed, 1 had no email address, 1 was listed twice.')
  assert.equal(excludedText({ noAccount: 1 }), '1 person was left out: 1 has no account for in-app notices.')
})

test('campaignTemplateIssue names the variables that are empty in a campaign', () => {
  assert.equal(campaignTemplateIssue({ subject: 'News from {{org.name}}', body: 'Hello {{recipient.name}}' }), null)
  assert.equal(campaignTemplateIssue({ subject: '{{record.title}}', body: 'See {{link.record}} and {{record.title}}' }),
    'This template uses {{record.title}}, {{link.record}}, which are empty in a campaign. Only {{org.name}} and {{recipient.name}} are filled in.')
})

test('the footer escapes the organisation name and links the unsubscribe page', () => {
  const out = withFooter({ html: '<p>Hi</p>', text: 'Hi' }, 'A & <B>', 'https://x.test/u?m=1&t=2')
  assert.match(out.html, /A &amp; &lt;B&gt;/)
  assert.match(out.html, /<a href="https:\/\/x\.test\/u\?m=1&amp;t=2">Unsubscribe from A &amp; &lt;B&gt; campaign emails<\/a>/)
  assert.match(out.text, /Unsubscribe from A & <B> campaign emails: https:\/\/x\.test\/u\?m=1&t=2$/)
  assert.doesNotMatch(`${out.html}${out.text}`, /\bwe\b/i)
})

test('unsubscribe tokens name their message and verify for it only', async () => {
  const secret = 'a-local-unsubscribe-secret-of-32+chars'
  const m1 = '00000000-0000-4000-8000-000000000001'
  const u = new URL(await unsubscribeLink('https://x.test/unsubscribe', secret, m1))
  assert.equal(u.pathname + u.search.slice(0, 3), '/unsubscribe?t=')
  const t = u.searchParams.get('t')!
  assert.match(t, new RegExp(`^${m1}\\.[A-Za-z0-9_-]{43}$`))
  assert.equal(await checkUnsubscribe(secret, t), m1)
  assert.equal(await checkUnsubscribe(secret, t.replace(m1, '00000000-0000-4000-8000-000000000002')), null)
  assert.equal(await checkUnsubscribe('another-secret-of-thirty-two-chars!!', t), null)
  assert.equal(await checkUnsubscribe(secret, 'not-a-uuid.abc'), null)
  assert.equal(await checkUnsubscribe(secret, null), null)
})

test('readUnsubscribeConfig refuses a relative URL, a query and a short secret', () => {
  const secret = 'x'.repeat(32)
  assert.deepEqual(readUnsubscribeConfig('http://127.0.0.1:54321/functions/v1/unsubscribe', secret), { url: 'http://127.0.0.1:54321/functions/v1/unsubscribe', secret })
  assert.throws(() => readUnsubscribeConfig('/functions/v1/unsubscribe', secret), /UNSUBSCRIBE_URL/)
  assert.throws(() => readUnsubscribeConfig('https://x.test/u?a=1', secret), /UNSUBSCRIBE_URL/)
  assert.throws(() => readUnsubscribeConfig('https://x.test/u', 'short'), /UNSUBSCRIBE_SECRET/)
  assert.throws(() => readUnsubscribeConfig(undefined, undefined), /UNSUBSCRIBE_URL/)
})

test('recipient csv guards formulas and keeps every row', () => {
  const row = (i: number, over = {}) => ({ id: `m${i}`, recipient_email: `p${i}@alpha.test`, status: 'sent', error: null, delivered_at: '2026-10-11T10:00:00.000Z', opened_at: null, clicked_at: null, bounced_at: null, ...over })
  const rows = [row(1, { recipient_email: '=HYPERLINK("x")@evil.test' }), row(2, { status: 'failed', error: '-1 refused' }), ...Array.from({ length: 1_498 }, (_, i) => row(i + 3))]
  const csv = recipientCsv(rows, 'email')
  const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n')
  assert.equal(lines[0], 'Email,Status,Delivered,Opened,Clicked,Bounced,Error')
  assert.equal(lines.length, 1_501)
  assert.equal(lines[1], `"'=HYPERLINK(""x"")@evil.test",Sent,2026-10-11T10:00:00.000Z,,,,`)
  assert.equal(lines[2], "p2@alpha.test,Failed,2026-10-11T10:00:00.000Z,,,,'-1 refused")
  assert.equal(recipientCsv([row(1, { opened_at: '2026-10-12T08:00:00.000Z' })], 'in_app').replace(/^﻿/, ''), 'Email,Read\r\np1@alpha.test,2026-10-12T08:00:00.000Z\r\n')
})
