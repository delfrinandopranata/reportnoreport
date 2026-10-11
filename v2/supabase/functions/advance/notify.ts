import { render, type RenderContext } from '../_shared/comms/render.ts'
import { EMAIL_RE, KIND_LABELS, readSendMessage, type TemplateKind } from '../_shared/comms/recipients.ts'
import { StepError, type RecordRow, type Tx } from './engine.ts'

export type TemplateRow = { id: string; org_id: string; kind: TemplateKind; name: string; channel: 'email' | 'in_app'; subject: string; body: string }
export type Person = { userId: string; email: string; name: string }
export type NewMessage = {
  org_id: string; template_id: string; record_id: string | null; recipient_user_id: string | null
  recipient_email: string; subject: string; body_html: string; body_text: string
}
export type NewNotification = { org_id: string; user_id: string; kind: TemplateKind; title: string; body: string; link: string }
export type MessageRow = { id: string; org_id: string; recipient_email: string; subject: string; body_html: string; body_text: string; attempts: number }
export type MessagePatch = { status: 'queued' | 'sent' | 'failed'; attempts: number; error: string | null; nextAttemptAt?: Date; sentAt?: Date; providerId?: string | null }
export type TaskRef = { id: string; node_id: string; assignee_role_id: string | null; assignee_user_id: string | null; claimed_by: string | null }
export type NotifyCtx = { now: Date; appUrl: string }
export type Sent = { emails: number; notices: number; skipped: number }
type Base = Omit<RenderContext, 'recipient'>

/**
 * shortcut: a message reaches at most 500 people (a role task notifies its first 500 holders by email order; a larger
 * Send message stops the record). Batch through the queue when an org has roles that big; campaigns (Phase 6) do.
 */
export const MAX_PEOPLE = 500
const FORMER = 'Former member'

function baseContext(rec: RecordRow, orgName: string, assignee: string, ctx: NotifyCtx, taskId: string | null): Base {
  return {
    record: { title: rec.title, data: rec.data },
    step: { assignee: { name: assignee } },
    link: { task: taskId ? `${ctx.appUrl}#/tasks/${taskId}` : '', record: `${ctx.appUrl}#/records/${rec.id}`, invite: '' },
    org: { name: orgName },
  }
}

/**
 * Renders the template once per recipient and writes, in the caller's transaction, an in-app notice for every member
 * (always) and a queued email when the template is email and that member has not muted its type. Raw addresses get
 * the email only; an in-app template cannot reach them, so they count as skipped.
 */
export async function deliver(tx: Tx, t: TemplateRow, people: Person[], emails: string[], base: Base, at: { recordId: string | null; link: string }): Promise<Sent> {
  const isEmail = t.channel === 'email'
  const muted = isEmail && people.length ? await tx.emailMuted(people.map((p) => p.userId), t.kind) : new Set<string>()
  const notices: NewNotification[] = []
  const mails: NewMessage[] = []
  const queue = (to: string, userId: string | null, r: ReturnType<typeof render>) => mails.push({
    org_id: t.org_id, template_id: t.id, record_id: at.recordId, recipient_user_id: userId, recipient_email: to,
    subject: r.subject || t.name, body_html: r.html, body_text: r.text,
  })
  for (const p of people) {
    const r = render(t, { ...base, recipient: { name: p.name } })
    notices.push({ org_id: t.org_id, user_id: p.userId, kind: t.kind, title: r.subject || t.name, body: r.text.slice(0, 2000), link: at.link })
    if (isEmail && !muted.has(p.userId)) queue(p.email, p.userId, r)
  }
  if (isEmail) for (const e of emails) queue(e, null, render(t, { ...base, recipient: { name: e } }))
  if (notices.length) await tx.notify(notices)
  if (mails.length) await tx.queueMessages(mails)
  return { emails: mails.length, notices: notices.length, skipped: isEmail ? 0 : emails.length }
}

/** Task assigned / Task overdue to whoever holds the task: its claimer, else its person, else every holder of its role. */
export async function notifyTask(tx: Tx, kind: 'task_assigned' | 'task_overdue', rec: RecordRow, task: TaskRef, ctx: NotifyCtx): Promise<Sent> {
  const t = await tx.template(rec.org_id, { kind })
  if (!t) throw new StepError(`The "${KIND_LABELS[kind]}" message template is missing. Ask an admin to restore it.`)
  const holder = task.claimed_by ?? task.assignee_user_id
  const people = holder
    ? await tx.peopleByIds(rec.org_id, [holder])
    : task.assignee_role_id ? await tx.peopleInRole(rec.org_id, task.assignee_role_id) : []
  const assignee = holder
    ? people[0]?.name ?? FORMER
    : (task.assignee_role_id ? await tx.roleName(task.assignee_role_id, rec.org_id) : null) ?? 'Unassigned'
  const base = baseContext(rec, await tx.orgName(rec.org_id), assignee, ctx, task.id)
  return deliver(tx, t, people, [], base, { recordId: rec.id, link: `#/tasks/${task.id}` })
}

/**
 * One Send message action on the path leaving `from`. Throws StepError when the template is gone or nobody can be
 * reached, so the record stops with the reason (spec §5.4); a single recipient that resolves to nobody is skipped and counted.
 */
export async function sendAction(tx: Tx, rec: RecordRow, from: string, a: unknown, ctx: NotifyCtx): Promise<Sent & { template: string; people: number }> {
  const cfg = readSendMessage(a)
  if (!cfg) throw new StepError('A "Send message" action on this path has no template or recipients. Ask a workflow manager to fix it.')
  const t = await tx.template(rec.org_id, { id: cfg.templateId })
  if (!t) throw new StepError('The message template of a "Send message" action no longer exists. Ask a workflow manager to choose another.')

  const ids = new Set<string>()
  const roles = new Set<string>()
  const addresses = new Set<string>()
  let skipped = 0
  for (const r of cfg.recipients) {
    if ('role' in r) roles.add(r.role)
    else if ('user' in r) ids.add(r.user)
    else if ('starter' in r) ids.add(rec.started_by)
    else if ('step' in r) {
      const who = await tx.lastSubmitter(rec.id, r.step)
      if (who) ids.add(who)
      else skipped++
    } else {
      const v = rec.data[r.field]
      if (typeof v === 'string' && EMAIL_RE.test(v.trim())) addresses.add(v.trim().toLowerCase())
      else skipped++
    }
  }
  const named = await tx.peopleByIds(rec.org_id, [...ids])
  skipped += ids.size - named.length // former members
  const byId = new Map(named.map((p) => [p.userId, p]))
  for (const role of roles) for (const p of await tx.peopleInRole(rec.org_id, role)) byId.set(p.userId, p)
  const people = [...byId.values()]
  for (const p of people) addresses.delete(p.email.toLowerCase())
  if (!people.length && !addresses.size) {
    throw new StepError(`"Send message" found nobody to send "${t.name}" to. Ask a workflow manager to check its recipients.`)
  }
  if (people.length + addresses.size > MAX_PEOPLE) {
    throw new StepError(`"Send message" would send "${t.name}" to more than ${MAX_PEOPLE} people. Ask a workflow manager to narrow its recipients.`)
  }
  const doer = await tx.lastSubmitter(rec.id, from)
  const doerName = doer ? (byId.get(doer) ?? (await tx.peopleByIds(rec.org_id, [doer]))[0])?.name ?? FORMER : 'Nobody yet'
  const base = baseContext(rec, await tx.orgName(rec.org_id), doerName, ctx, null)
  const sent = await deliver(tx, t, people, [...addresses], base, { recordId: rec.id, link: `#/records/${rec.id}` })
  return { template: t.name, people: people.length + addresses.size, ...sent, skipped: sent.skipped + skipped }
}
