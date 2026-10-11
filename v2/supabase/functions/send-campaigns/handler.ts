import { MAX_AUDIENCE, campaignContext, planRecipients, readAudience, unsubscribeLink, withFooter, type Audience, type Found } from '../_shared/comms/campaign.ts'
import { EMAIL_RE } from '../_shared/comms/recipients.ts'
import { render } from '../_shared/comms/render.ts'
import { readReportDef, runReport, type ReportRecord } from '../_shared/reports/index.ts'
import type { Result } from '../advance/engine.ts'
import { MAX_SCAN } from '../run-report/handler.ts'
import type { CampaignMessage, CampaignNotice, CampaignRow, CampaignStore, CampaignTx } from './store.ts'

export type Deps = { authorised: boolean; store: CampaignStore; now(): Date; unsubscribe: { url: string; secret: string } }
/** A reason the campaign cannot be sent as it stands; its message is stored and shown as it is. */
export class CampaignProblem extends Error {}
function fail(message: string): never { throw new CampaignProblem(message) }

export const CHUNK = 1_000 // rows per insert; 10,000 people = 10 inserts in one transaction
const DUE = 5 // shortcut: five campaigns start per minute; raise when organisations schedule more at the same minute
export const NOT_PREPARED = 'This campaign could not be prepared. Edit it and schedule it again.'
export const PROBLEMS = {
  noSender: 'The person who scheduled this campaign is no longer a member. Edit it and schedule it again.',
  senderLost: 'The person who scheduled this campaign can no longer send campaigns. Ask someone who can to schedule it again.',
  template: 'The message template of this campaign no longer exists. Choose another and schedule it again.',
  audience: 'Who this campaign is for is incomplete. Edit it and schedule it again.',
  role: 'The role this campaign is for no longer exists. Choose another and schedule it again.',
  report: 'The report this campaign is for no longer exists, or the person who scheduled it cannot open it. Choose another and schedule it again.',
  reportBroken: 'The report this campaign is for needs fixing before it can choose recipients. Fix the report, then schedule the campaign again.',
  grouped: 'A grouped report cannot choose recipients, because it lists groups instead of people. Choose a report without grouping.',
  records: 'The report this campaign is for covers more than 10,000 records its sender can see, which is more than one campaign can read. Narrow the report.',
  parent: 'The campaign this follow-up is based on has not been sent, or no longer exists.',
  completion: 'Reminding non-completers needs a sent campaign with a linked workflow whose records the sender can all see.',
} as const

/** pg_cron every minute, and schedule_campaign at once for "Send now". One transaction per campaign. */
export async function sendCampaigns(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { started: 0, failed: 0 }
  const ids = await deps.store.tx((tx) => tx.dueCampaigns(now, DUE))
  for (const id of ids) {
    try {
      if (await deps.store.tx((tx) => prepare(tx, id, deps, now))) counts.started += 1
    } catch (e) {
      if (!(e instanceof CampaignProblem)) console.error('campaign prepare failed', id, e) // detail stays in the server log
      const reason = e instanceof CampaignProblem ? e.message : NOT_PREPARED
      if (await deps.store.tx((tx) => tx.fail(id, reason))) counts.failed += 1
    }
  }
  return { status: 200, body: counts }
}

/** Claim, snapshot and queue in one transaction: a throw rolls all of it back, so a campaign is queued completely or not at all. */
async function prepare(tx: CampaignTx, id: string, deps: Deps, now: Date): Promise<boolean> {
  const c = await tx.claim(id, now)
  if (!c) return false // another run claimed it, or it was cancelled
  const sender = c.sent_by ?? fail(PROBLEMS.noSender)
  const audience = readAudience(c.audience) ?? fail(PROBLEMS.audience)
  const t = (c.template_id ? await tx.template(c.org_id, c.template_id) : null) ?? fail(PROBLEMS.template)
  const found = await resolveAudience(tx, c, sender, audience, now)
  const optedOut = t.channel === 'email' ? await tx.optedOut(c.org_id, [...found.people.map((p) => p.email), ...found.emails]) : new Set<string>()
  const plan = planRecipients(found, optedOut, t.channel)
  if (!plan.ok) fail(plan.error)

  const org = await tx.orgName(c.org_id)
  const rows: CampaignMessage[] = []
  for (const r of plan.list) {
    const messageId = crypto.randomUUID() // known before the insert, so the unsubscribe link can name it
    const out = render(t, campaignContext(org, r.name))
    const link = t.channel === 'email' ? await unsubscribeLink(deps.unsubscribe.url, deps.unsubscribe.secret, messageId) : null
    const body = link ? withFooter(out, org, link) : out
    rows.push({
      id: messageId, org_id: c.org_id, campaign_id: c.id, template_id: t.id, recipient_user_id: r.userId, recipient_email: r.email,
      channel: t.channel, status: t.channel === 'email' ? 'queued' : 'sent', subject: out.subject || t.name,
      body_html: body.html, body_text: body.text, unsubscribe_url: link, sent_at: t.channel === 'email' ? null : now,
    })
  }
  for (let i = 0; i < rows.length; i += CHUNK) await tx.queue(rows.slice(i, i + CHUNK))
  if (t.channel === 'in_app') {
    const notices: CampaignNotice[] = rows.flatMap((r) => (r.recipient_user_id
      ? [{ org_id: c.org_id, user_id: r.recipient_user_id, campaign_id: c.id, kind: 'campaign' as const, title: r.subject, body: r.body_text.slice(0, 2000), link: '#/inbox' }]
      : []))
    for (let i = 0; i < notices.length; i += CHUNK) await tx.notify(notices.slice(i, i + CHUNK))
  }
  await tx.finish(c.id, { recipients: rows.length, excluded: plan.excluded, channel: t.channel, status: t.channel === 'email' ? 'sending' : 'sent', at: now })
  return true
}

async function resolveAudience(tx: CampaignTx, c: CampaignRow, sender: string, a: Audience, now: Date): Promise<Found> {
  if (!(await tx.asSender(sender, (s) => s.can(c.org_id, 'comms.broadcast')))) fail(PROBLEMS.senderLost)
  if (a.kind === 'role') {
    if (!(await tx.roleExists(c.org_id, a.roleId))) fail(PROBLEMS.role)
    // One past the cap, so planRecipients refuses a role that is too big instead of cutting it (decision 2).
    return { people: await tx.roleMembers(c.org_id, a.roleId, MAX_AUDIENCE + 1), emails: [], noEmail: 0 }
  }
  if (a.kind === 'report') return reportAudience(tx, c, sender, a, now)
  return followupAudience(tx, c, sender, a)
}

async function reportAudience(tx: CampaignTx, c: CampaignRow, sender: string, a: Extract<Audience, { kind: 'report' }>, now: Date): Promise<Found> {
  // Read as the sender: saved_reports_read and records_read decide which report and records exist (decision 1).
  const picked = await tx.asSender(sender, async (s) => {
    if (!(await s.can(c.org_id, 'reports.view')) && !(await s.can(c.org_id, 'reports.manage'))) fail(PROBLEMS.report)
    const saved = (await s.savedReport(a.reportId, c.org_id)) ?? fail(PROBLEMS.report)
    const def = readReportDef(saved)
    if (!def.ok) fail(PROBLEMS.reportBroken)
    if (def.value.groupBy) fail(PROBLEMS.grouped)
    const records: ReportRecord[] = []
    for await (const page of s.records(c.org_id, saved.workflow_id)) {
      records.push(...page)
      if (records.length > MAX_SCAN) fail(PROBLEMS.records)
    }
    // Filters read answers and `now` (within_days); the step and person names only feed display columns nobody sees here.
    const result = runReport(records, def.value, { now, stepName: () => '', personName: () => '' }, null)
    if (result.kind !== 'rows') fail(PROBLEMS.grouped)
    const byId = new Map(records.map((r) => [r.id, r]))
    return result.rows.map((row) => byId.get(row.id) as ReportRecord)
  })
  if (a.to === 'starter') {
    const ids = [...new Set(picked.map((r) => r.started_by))] // one person however many records they started
    const people = await tx.peopleByIds(c.org_id, ids)
    return { people, emails: [], noEmail: ids.length - people.length } // former members have no address here
  }
  const field = a.to.field
  const emails: string[] = []
  let noEmail = 0
  for (const r of picked) {
    const v = r.data?.[field]
    if (typeof v === 'string' && EMAIL_RE.test(v.trim())) emails.push(v.trim())
    else noEmail += 1
  }
  return { people: [], emails, noEmail }
}

async function followupAudience(tx: CampaignTx, c: CampaignRow, sender: string, a: Extract<Audience, { kind: 'followup' }>): Promise<Found> {
  const parent = (await tx.parent(c.org_id, a.campaignId)) ?? fail(PROBLEMS.parent) // scoped to this organisation
  if (parent.status !== 'sent') fail(PROBLEMS.parent)
  if (a.who === 'not_completed') {
    const wf = parent.linked_workflow_id ?? fail(PROBLEMS.completion)
    if (!(await tx.asSender(sender, (s) => s.can(c.org_id, 'records.view_all', wf)))) fail(PROBLEMS.completion)
  }
  const rows = await tx.parentRecipients(c.org_id, a.campaignId, a.who)
  const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))]
  const people = await tx.peopleByIds(c.org_id, ids) // still active members only
  return { people, emails: rows.filter((r) => !r.userId).map((r) => r.email), noEmail: ids.length - people.length }
}
