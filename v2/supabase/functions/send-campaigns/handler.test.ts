import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { LEASE_MS, MAX_ATTEMPTS, NOT_PREPARED, PROBLEMS, sendCampaigns, type Deps } from './handler.ts'
import type { CampaignRow, CampaignStore, CampaignTx, Finish, QueueInput, SenderReads } from './store.ts'
import { MAX_AUDIENCE, TOO_BIG, type Person } from '../_shared/comms/campaign.ts'
import { rec } from '../_shared/reports/fixture.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'

const ORG = '0000000a-0000-0000-0000-000000000001'
const C = '0000000a-0000-0000-0000-00000000f601'
const PARENT = '0000000a-0000-0000-0000-00000000f600'
const ROLE = '0000000a-0000-0000-0000-00000000a001'
const REPORT = '0000000a-0000-0000-0000-00000000e001'
const WF = '0000000a-0000-0000-0000-00000000c001'
const ADMIN = '00000000-0000-0000-0000-0000000000a2'
const MEMBER = '00000000-0000-0000-0000-0000000000a3'
const NOW = new Date('2026-10-11T12:00:00Z')
const UNSUB = { url: 'https://x.test/functions/v1/unsubscribe', page: 'https://x.test/unsubscribe', secret: 'a-local-unsubscribe-secret-of-32+chars' }
const EMAIL_T: TemplateRow = { id: 't1', org_id: ORG, kind: 'custom', name: 'Term news', channel: 'email', subject: 'News from {{org.name}}', body: 'Hello {{recipient.name}}' }
const person = (i: number): Person => ({ userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `p${i}@alpha.test`, name: `Person ${i}` })
const people = (n: number) => Array.from({ length: n }, (_, i) => person(i))
const SAVED: SavedRow = { name: 'Staff', workflow_id: WF, columns: [{ meta: 'title' }], filters: [{ field: 'kind', operator: 'is', value: 'staff' }], group_by: null, aggregate: null }

type Parent = { status: string; linked_workflow_id: string | null; recipients: { userId: string | null; email: string; opened: boolean; done: boolean }[] }
type World = {
  campaign: CampaignRow & { status: string; attempts: number; leasedUntil: Date | null }
  templates: TemplateRow[]; roles: Map<string, Person[]>; members: Person[]; optouts: Set<string>
  perms: Map<string, Set<string>>; saved: Map<string, SavedRow>; records: ReportRecord[]; parents: Map<string, Parent>
  messages: { recipient_email: string; recipient_user_id: string | null; channel: string; status: string }[]; inputs: QueueInput[]; finished: Finish | null; failed: string | null; boom: boolean
}
const world = (over: Partial<World> = {}): World => ({
  campaign: { id: C, org_id: ORG, name: 'Term news', template_id: 't1', audience: { kind: 'role', roleId: ROLE }, sent_by: ADMIN, status: 'scheduled', attempts: 0, leasedUntil: null },
  templates: [EMAIL_T], roles: new Map([[ROLE, [person(1), person(2)]]]),
  members: [person(1), person(2), { userId: MEMBER, email: 'member@alpha.test', name: 'Member' }, { userId: ADMIN, email: 'admin@alpha.test', name: 'Admin' }],
  optouts: new Set(),
  perms: new Map([[ADMIN, new Set(['comms.broadcast', 'reports.view', 'records.view_all'])], [MEMBER, new Set(['comms.broadcast', 'reports.view'])]]),
  saved: new Map([[REPORT, SAVED]]), records: [], parents: new Map(),
  messages: [], inputs: [], finished: null, failed: null, boom: false, ...over,
})
// RLS in miniature: records.view_all sees every record, anyone else only what they started.
const reads = (w: World, user: string): SenderReads => ({
  can: async (_o, perm) => w.perms.get(user)?.has(perm) ?? false,
  savedReport: async (id) => (w.perms.get(user)?.has('reports.view') ? w.saved.get(id) ?? null : null),
  async *records() { yield w.records.filter((r) => w.perms.get(user)?.has('records.view_all') || r.started_by === user) },
})
/** Writes land only when the transaction function resolves, like a commit; a throw leaves the world as it was. */
function store(w: World): CampaignStore {
  return {
    async tx<T>(fn: (tx: CampaignTx) => Promise<T>) {
      const p = { inputs: [] as QueueInput[], finished: null as Finish | null, claimed: false, failed: null as string | null }
      const tx: CampaignTx = {
        dueCampaigns: async () => [w.campaign.id],
        startAttempt: async (id, now, until) => {
          const c = w.campaign
          if (id !== c.id || c.status !== 'scheduled' || (c.leasedUntil && c.leasedUntil > now)) return null
          c.attempts += 1 // committed before the work, like the real store, so a killed run still counts
          c.leasedUntil = until
          return c.attempts
        },
        claim: async (id) => (id === w.campaign.id && w.campaign.status === 'scheduled' ? (p.claimed = true, { ...w.campaign }) : null),
        asSender: (user, f) => f(reads(w, user)),
        template: async (org, id) => w.templates.find((t) => t.id === id && t.org_id === org) ?? null,
        orgName: async () => 'Alpha School',
        roleExists: async (_o, r) => w.roles.has(r),
        roleEligible: async (_o, r) => new Set((w.roles.get(r) ?? []).map((m) => m.email.toLowerCase()).filter((e) => !w.optouts.has(e))).size,
        roleMembers: async (_o, r) => w.roles.get(r) ?? [],
        peopleByIds: async (_o, ids) => w.members.filter((m) => ids.includes(m.userId)),
        parent: async (org, id) => (org === ORG ? w.parents.get(id) ?? null : null),
        parentRecipients: async (_o, id, who) => (w.parents.get(id)?.recipients ?? [])
          .filter((r) => (who === 'not_opened' ? !r.opened : !!r.userId && !r.done)).map(({ userId, email }) => ({ userId, email })),
        optedOut: async (_o, emails) => new Set(emails.map((e) => e.toLowerCase()).filter((e) => w.optouts.has(e))),
        queueAudience: async (q) => {
          if (w.boom) throw new Error('connection reset by peer at 10.0.0.1:5432')
          p.inputs.push(q)
        },
        finish: async (_id, f) => { p.finished = f },
        fail: async (_id, error) => (w.campaign.status === 'scheduled' ? (p.failed = error, true) : false),
      }
      const out = await fn(tx)
      if (p.claimed) w.campaign.status = 'sending'
      if (p.finished) { w.campaign.status = p.finished.status; w.finished = p.finished }
      if (p.failed) { w.campaign.status = 'failed'; w.failed = p.failed }
      for (const q of p.inputs) {
        w.inputs.push(q)
        w.messages.push(...q.list.map((r) => ({ recipient_email: r.email, recipient_user_id: r.userId, channel: q.channel, status: q.channel === 'email' ? 'queued' : 'sent' })))
      }
      return out
    },
  }
}
const deps = (w: World, authorised = true): Deps => ({ authorised, store: store(w), now: () => NOW, unsubscribe: UNSUB })
const ZERO = { unsubscribed: 0, duplicate: 0, noEmail: 0, noAccount: 0 }

Deno.test('401 without the cron secret, and nothing is queued', async () => {
  const w = world()
  assertEquals((await sendCampaigns(deps(w, false))).status, 401)
  assertEquals([w.messages.length, w.campaign.status], [0, 'scheduled'])
})

Deno.test('a role campaign queues one email per member; the template is rendered once with the footer', async () => {
  const w = world()
  assertEquals((await sendCampaigns(deps(w))).body, { started: 1, failed: 0 })
  assertEquals(w.messages.map((m) => [m.recipient_email, m.status, m.channel]), [['p1@alpha.test', 'queued', 'email'], ['p2@alpha.test', 'queued', 'email']])
  assertEquals(w.inputs.length, 1) // one set-based insert, not one per person
  const q = w.inputs[0]
  // Per-person values are filled in by the insert; the handler renders the shared text once around two tokens.
  assertEquals([q.subject, q.unsubscribe], ['News from Alpha School', UNSUB])
  assert(q.text.startsWith(`Hello ${q.nameToken}\n\n--\n`))
  assert(q.text.endsWith(`Unsubscribe from Alpha School campaign emails: ${q.linkToken}`))
  assert(q.html.includes(`<a href="${q.linkToken}"`))
  assertEquals(w.finished, { recipients: 2, excluded: ZERO, channel: 'email', status: 'sending', at: NOW })
  assertEquals(w.campaign.status, 'sending')
})

Deno.test('an opted-out member is left out and counted', async () => {
  const w = world({ optouts: new Set(['p2@alpha.test']) })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.map((m) => m.recipient_email), w.finished?.excluded], [['p1@alpha.test'], { ...ZERO, unsubscribed: 1 }])
})

Deno.test('a 10,000-person audience is queued in one insert with nobody dropped', async () => {
  const w = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE)]]) })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.length, new Set(w.messages.map((m) => m.recipient_email)).size, w.inputs.length], [10_000, 10_000, 1])
  assertEquals(w.finished?.recipients, 10_000)
  const over = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE + 1)]]) })
  assertEquals((await sendCampaigns(deps(over))).body, { started: 0, failed: 1 })
  assertEquals([over.messages.length, over.campaign.status, over.failed], [0, 'failed', TOO_BIG])
})

Deno.test('the limit counts who is left after opt-outs: 10,000 eligible send, 10,001 fail, nobody is cut (QA-P6-1)', async () => {
  const optouts = new Set(['p0@alpha.test', 'p1@alpha.test'])
  const fits = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE + 2)]]), optouts })
  assertEquals((await sendCampaigns(deps(fits))).body, { started: 1, failed: 0 })
  assertEquals([fits.messages.length, fits.finished?.excluded], [10_000, { ...ZERO, unsubscribed: 2 }])
  assert(fits.messages.some((m) => m.recipient_email === `p${MAX_AUDIENCE + 1}@alpha.test`)) // the last person is not truncated
  const over = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE + 3)]]), optouts })
  assertEquals((await sendCampaigns(deps(over))).body, { started: 0, failed: 1 })
  assertEquals([over.messages.length, over.failed], [0, TOO_BIG])
})

Deno.test('a run that was killed is retried after its lease, and the third killed run fails the campaign with a reason (QA-P6-3)', async () => {
  const leased = world({ campaign: { ...world().campaign, attempts: 1, leasedUntil: new Date(NOW.getTime() + LEASE_MS) } })
  assertEquals((await sendCampaigns(deps(leased))).body, { started: 0, failed: 0 }) // another run still holds it
  assertEquals([leased.campaign.attempts, leased.campaign.status], [1, 'scheduled'])
  const retry = world({ campaign: { ...world().campaign, attempts: MAX_ATTEMPTS - 1, leasedUntil: new Date(NOW.getTime() - 1) } })
  assertEquals((await sendCampaigns(deps(retry))).body, { started: 1, failed: 0 })
  assertEquals([retry.campaign.attempts, retry.campaign.status], [MAX_ATTEMPTS, 'sending'])
  const spent = world({ campaign: { ...world().campaign, attempts: MAX_ATTEMPTS, leasedUntil: new Date(NOW.getTime() - 1) } })
  assertEquals((await sendCampaigns(deps(spent))).body, { started: 0, failed: 1 })
  assertEquals([spent.failed, spent.messages.length, spent.campaign.status], [PROBLEMS.attempts, 0, 'failed'])
  assert(!/\bwe\b/i.test(PROBLEMS.attempts))
})

Deno.test('a report audience is filtered and read with the sender\'s visibility', async () => {
  const records = [
    rec('r1', { kind: 'staff' }, { started_by: MEMBER }),
    rec('r2', { kind: 'staff' }, { started_by: ADMIN }),
    rec('r3', { kind: 'other' }, { started_by: MEMBER }),
  ]
  const audience = { kind: 'report', reportId: REPORT, to: 'starter' }
  const asMember = world({ records, campaign: { ...world().campaign, audience, sent_by: MEMBER } })
  await sendCampaigns(deps(asMember))
  assertEquals(asMember.messages.map((m) => m.recipient_email), ['member@alpha.test'])
  const asAdmin = world({ records, campaign: { ...world().campaign, audience, sent_by: ADMIN } })
  await sendCampaigns(deps(asAdmin))
  assertEquals(asAdmin.messages.map((m) => m.recipient_email).sort(), ['admin@alpha.test', 'member@alpha.test'])
})

Deno.test('an email answer audience counts the records without a usable address', async () => {
  const records = [rec('r1', { kind: 'staff', contact: 'Ext@Example.test' }), rec('r2', { kind: 'staff', contact: '' }), rec('r3', { kind: 'staff', contact: 'nope' })]
  const w = world({ records, campaign: { ...world().campaign, audience: { kind: 'report', reportId: REPORT, to: { field: 'contact' } } } })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.map((m) => [m.recipient_email, m.recipient_user_id]), w.finished?.excluded], [[['ext@example.test', null]], { ...ZERO, noEmail: 2 }])
})

Deno.test('a grouped report, a missing template and a sender without comms.broadcast each fail with the reason', async () => {
  const grouped = world({ saved: new Map([[REPORT, { ...SAVED, group_by: { field: 'kind' }, aggregate: { fn: 'count' } }]]),
    campaign: { ...world().campaign, audience: { kind: 'report', reportId: REPORT, to: 'starter' } } })
  await sendCampaigns(deps(grouped))
  assertEquals([grouped.failed, grouped.messages.length], [PROBLEMS.grouped, 0])
  const noTemplate = world({ templates: [] })
  await sendCampaigns(deps(noTemplate))
  assertEquals(noTemplate.failed, PROBLEMS.template)
  const lost = world({ perms: new Map([[ADMIN, new Set(['reports.view'])]]) })
  await sendCampaigns(deps(lost))
  assertEquals([lost.failed, lost.messages.length], [PROBLEMS.senderLost, 0])
})

Deno.test('an in-app campaign is queued as sent rows with no footer, and finishes at once', async () => {
  const w = world({ templates: [{ ...EMAIL_T, channel: 'in_app' }] })
  await sendCampaigns(deps(w))
  assertEquals(w.messages.map((m) => [m.channel, m.status]), [['in_app', 'sent'], ['in_app', 'sent']])
  assertEquals([w.inputs[0].channel, w.inputs[0].text.includes('Unsubscribe'), w.inputs[0].html.includes(w.inputs[0].linkToken)], ['in_app', false, false])
  assertEquals([w.campaign.status, w.finished?.status], ['sent', 'sent'])
})

Deno.test('the stand-ins for name and link are random per run, so a template that contains the old fixed ones keeps them', async () => {
  const text = 'Hello {{recipient.name}} @@recipient-name@@ @@unsubscribe-link@@'
  const run = async () => {
    const w = world({ templates: [{ ...EMAIL_T, body: text }] })
    await sendCampaigns(deps(w))
    return w.inputs[0]
  }
  const [a, b] = [await run(), await run()]
  assert(a.nameToken !== b.nameToken && a.linkToken !== b.linkToken)
  for (const q of [a, b]) {
    for (const fixed of ['@@recipient-name@@', '@@unsubscribe-link@@']) assert(q.nameToken !== fixed && q.linkToken !== fixed)
    assert(q.nameToken !== q.linkToken)
    assert(q.text.includes(`Hello ${q.nameToken} @@recipient-name@@ @@unsubscribe-link@@`)) // the literal text survives
  }
})

Deno.test('a campaign another run claimed sends nothing', async () => {
  const w = world({ campaign: { ...world().campaign, status: 'sending' } })
  assertEquals((await sendCampaigns(deps(w))).body, { started: 0, failed: 0 })
  assertEquals([w.messages.length, w.failed], [0, null])
})

Deno.test('a follow-up reaches who did not open; one built on another organisation\'s campaign fails', async () => {
  const parent: Parent = { status: 'sent', linked_workflow_id: WF, recipients: [
    { userId: person(1).userId, email: 'p1@alpha.test', opened: true, done: true },
    { userId: person(2).userId, email: 'p2@alpha.test', opened: false, done: false },
    { userId: null, email: 'raw@example.test', opened: false, done: false },
  ] }
  const w = world({ parents: new Map([[PARENT, parent]]), campaign: { ...world().campaign, audience: { kind: 'followup', campaignId: PARENT, who: 'not_opened' } } })
  await sendCampaigns(deps(w))
  assertEquals(w.messages.map((m) => m.recipient_email), ['p2@alpha.test', 'raw@example.test'])
  const remind = world({ parents: new Map([[PARENT, parent]]), campaign: { ...world().campaign, audience: { kind: 'followup', campaignId: PARENT, who: 'not_completed' } } })
  await sendCampaigns(deps(remind))
  assertEquals(remind.messages.map((m) => m.recipient_email), ['p2@alpha.test'])
  const foreign = world({ campaign: { ...world().campaign, audience: { kind: 'followup', campaignId: '0000000b-0000-0000-0000-00000000f600', who: 'not_opened' } } })
  await sendCampaigns(deps(foreign))
  assertEquals([foreign.failed, foreign.messages.length], [PROBLEMS.parent, 0])
})

Deno.test('an unexpected error rolls everything back and fails with a plain sentence', async () => {
  const w = world({ boom: true })
  const errors: unknown[] = []
  const log = console.error
  console.error = (...a: unknown[]) => { errors.push(a) }
  try {
    assertEquals((await sendCampaigns(deps(w))).body, { started: 0, failed: 1 })
  } finally { console.error = log }
  assertEquals([w.messages.length, w.failed, w.campaign.status], [0, NOT_PREPARED, 'failed'])
  assert(!w.failed!.includes('10.0.0.1'))
  assertEquals(errors.length, 1) // the detail went to the log only
})
