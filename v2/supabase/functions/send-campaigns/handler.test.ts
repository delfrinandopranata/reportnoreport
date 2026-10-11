import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { CHUNK, NOT_PREPARED, PROBLEMS, sendCampaigns, type Deps } from './handler.ts'
import type { CampaignMessage, CampaignNotice, CampaignRow, CampaignStore, CampaignTx, Finish, SenderReads } from './store.ts'
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
const UNSUB = { url: 'https://x.test/functions/v1/unsubscribe', secret: 'a-local-unsubscribe-secret-of-32+chars' }
const EMAIL_T: TemplateRow = { id: 't1', org_id: ORG, kind: 'custom', name: 'Term news', channel: 'email', subject: 'News from {{org.name}}', body: 'Hello {{recipient.name}}' }
const person = (i: number): Person => ({ userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `p${i}@alpha.test`, name: `Person ${i}` })
const people = (n: number) => Array.from({ length: n }, (_, i) => person(i))
const SAVED: SavedRow = { name: 'Staff', workflow_id: WF, columns: [{ meta: 'title' }], filters: [{ field: 'kind', operator: 'is', value: 'staff' }], group_by: null, aggregate: null }

type Parent = { status: string; linked_workflow_id: string | null; recipients: { userId: string | null; email: string; opened: boolean; done: boolean }[] }
type World = {
  campaign: CampaignRow & { status: string }
  templates: TemplateRow[]; roles: Map<string, Person[]>; members: Person[]; optouts: Set<string>
  perms: Map<string, Set<string>>; saved: Map<string, SavedRow>; records: ReportRecord[]; parents: Map<string, Parent>
  messages: CampaignMessage[]; notices: CampaignNotice[]; finished: Finish | null; failed: string | null; queueCalls: number; boom: boolean
}
const world = (over: Partial<World> = {}): World => ({
  campaign: { id: C, org_id: ORG, name: 'Term news', template_id: 't1', audience: { kind: 'role', roleId: ROLE }, sent_by: ADMIN, status: 'scheduled' },
  templates: [EMAIL_T], roles: new Map([[ROLE, [person(1), person(2)]]]),
  members: [person(1), person(2), { userId: MEMBER, email: 'member@alpha.test', name: 'Member' }, { userId: ADMIN, email: 'admin@alpha.test', name: 'Admin' }],
  optouts: new Set(),
  perms: new Map([[ADMIN, new Set(['comms.broadcast', 'reports.view', 'records.view_all'])], [MEMBER, new Set(['comms.broadcast', 'reports.view'])]]),
  saved: new Map([[REPORT, SAVED]]), records: [], parents: new Map(),
  messages: [], notices: [], finished: null, failed: null, queueCalls: 0, boom: false, ...over,
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
      const p = { messages: [] as CampaignMessage[], notices: [] as CampaignNotice[], finished: null as Finish | null, claimed: false, failed: null as string | null, calls: 0 }
      const tx: CampaignTx = {
        dueCampaigns: async () => [w.campaign.id],
        claim: async (id) => (id === w.campaign.id && w.campaign.status === 'scheduled' ? (p.claimed = true, { ...w.campaign }) : null),
        asSender: (user, f) => f(reads(w, user)),
        template: async (org, id) => w.templates.find((t) => t.id === id && t.org_id === org) ?? null,
        orgName: async () => 'Alpha School',
        roleExists: async (_o, r) => w.roles.has(r),
        roleMembers: async (_o, r, limit) => (w.roles.get(r) ?? []).slice(0, limit),
        peopleByIds: async (_o, ids) => w.members.filter((m) => ids.includes(m.userId)),
        parent: async (org, id) => (org === ORG ? w.parents.get(id) ?? null : null),
        parentRecipients: async (_o, id, who) => (w.parents.get(id)?.recipients ?? [])
          .filter((r) => (who === 'not_opened' ? !r.opened : !!r.userId && !r.done)).map(({ userId, email }) => ({ userId, email })),
        optedOut: async (_o, emails) => new Set(emails.map((e) => e.toLowerCase()).filter((e) => w.optouts.has(e))),
        queue: async (rows) => {
          if (w.boom) throw new Error('connection reset by peer at 10.0.0.1:5432')
          p.messages.push(...rows)
          p.calls += 1
        },
        notify: async (rows) => { p.notices.push(...rows) },
        finish: async (_id, f) => { p.finished = f },
        fail: async (_id, error) => (w.campaign.status === 'scheduled' ? (p.failed = error, true) : false),
      }
      const out = await fn(tx)
      if (p.claimed) w.campaign.status = 'sending'
      if (p.finished) { w.campaign.status = p.finished.status; w.finished = p.finished }
      if (p.failed) { w.campaign.status = 'failed'; w.failed = p.failed }
      w.messages.push(...p.messages)
      w.notices.push(...p.notices)
      w.queueCalls += p.calls
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

Deno.test('a role campaign queues one email per member with the footer and an unsubscribe link', async () => {
  const w = world()
  assertEquals((await sendCampaigns(deps(w))).body, { started: 1, failed: 0 })
  assertEquals(w.messages.map((m) => [m.recipient_email, m.subject, m.status, m.channel]),
    [['p1@alpha.test', 'News from Alpha School', 'queued', 'email'], ['p2@alpha.test', 'News from Alpha School', 'queued', 'email']])
  const m = w.messages[0]
  assertMatch(m.unsubscribe_url!, new RegExp(`^https://x\\.test/functions/v1/unsubscribe\\?m=${m.id}&t=[A-Za-z0-9_-]{43}$`))
  assertMatch(m.body_text, /^Hello Person 1\n\n--\n/)
  assert(m.body_text.endsWith(`Unsubscribe from Alpha School campaign emails: ${m.unsubscribe_url}`))
  assertEquals(w.finished, { recipients: 2, excluded: ZERO, channel: 'email', status: 'sending', at: NOW })
  assertEquals(w.campaign.status, 'sending')
})

Deno.test('an opted-out member is left out and counted', async () => {
  const w = world({ optouts: new Set(['p2@alpha.test']) })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.map((m) => m.recipient_email), w.finished?.excluded], [['p1@alpha.test'], { ...ZERO, unsubscribed: 1 }])
})

Deno.test('a 10,000-person audience is queued in ten chunks with nobody dropped', async () => {
  const w = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE)]]) })
  await sendCampaigns(deps(w))
  assertEquals([w.messages.length, new Set(w.messages.map((m) => m.recipient_email)).size, w.queueCalls, CHUNK], [10_000, 10_000, 10, 1_000])
  assertEquals(w.finished?.recipients, 10_000)
  const over = world({ roles: new Map([[ROLE, people(MAX_AUDIENCE + 1)]]) })
  assertEquals((await sendCampaigns(deps(over))).body, { started: 0, failed: 1 })
  assertEquals([over.messages.length, over.campaign.status, over.failed], [0, 'failed', TOO_BIG])
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

Deno.test('an in-app campaign writes notices and sent rows, and finishes at once', async () => {
  const w = world({ templates: [{ ...EMAIL_T, channel: 'in_app' }] })
  await sendCampaigns(deps(w))
  assertEquals(w.messages.map((m) => [m.channel, m.status, m.unsubscribe_url, m.sent_at?.toISOString()]),
    [['in_app', 'sent', null, NOW.toISOString()], ['in_app', 'sent', null, NOW.toISOString()]])
  assertEquals(w.notices.map((n) => [n.user_id, n.title, n.link, n.campaign_id]), [[person(1).userId, 'News from Alpha School', '#/inbox', C], [person(2).userId, 'News from Alpha School', '#/inbox', C]])
  assertEquals([w.campaign.status, w.finished?.status], ['sent', 'sent'])
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
