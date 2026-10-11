import type { NewEvent, PdfJob, PdfSourceRow, NewSubmission, RecordRow, ScheduledRow, Store, TaskRow, Tx, WorkflowRow } from './engine.ts'
import { startRecord, submitTask, resumeOne, type Ctx } from './engine.ts'
import type { MessagePatch, NewMessage, NewNotification, TemplateRow } from './notify.ts'
import type { Graph } from '../_shared/workflow/graph.ts'
import { FORM, ORG, VALID } from '../_shared/forms/fixture.ts'
import { ADMIN, F_APPROVAL, F_LEAVE, LEAVE, MEMBER, ROLE_ADMIN, T_APPROVED, WF } from '../_shared/workflow/fixture.ts'

type Sched = ScheduledRow & { run_at: Date; status: 'pending' | 'done' | 'skipped' | 'failed'; error: string | null }
export type Db = {
  workflows: WorkflowRow[]
  forms: { id: string; org_id: string; schema: unknown }[]
  members: { user_id: string; org_id: string; email: string; name: string }[]
  roles: { id: string; org_id: string; name: string }[]
  holders: Set<string> // `${userId}:${roleId}` pairs
  starters: Set<string> // `${userId}:${workflowId}` pairs that pass has_permission(org, 'records.start', workflow)
  records: RecordRow[]
  tasks: (TaskRow & { due_at: Date | null; overdue_notified_at: Date | null })[]
  submissions: (NewSubmission & { id: string })[]
  scheduled: Sched[]
  events: NewEvent[]
  orgName: string
  templates: TemplateRow[]
  muted: Set<string> // `${userId}:${kind}` pairs with email turned off
  notifications: NewNotification[]
  reportTemplates: Set<string> // workflow ids with a report template
  pdfs: (PdfJob & { status: 'queued' | 'done' | 'failed'; next_attempt_at: Date; path: string | null; error: string | null })[]
  pdfSources: Map<string, PdfSourceRow> // record id → what pdfSource returns
  messages: (NewMessage & { id: string; status: MessagePatch['status']; attempts: number; error: string | null; next_attempt_at: Date; sent_at: Date | null; provider_id: string | null })[]
}

const person = (m: Db['members'][number]) => ({ userId: m.user_id, email: m.email, name: m.name })

/** Yields so two transactions interleave the way two connections would. */
const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * In-memory Tx with real per-record and per-timer locks held until the transaction ends, like FOR UPDATE.
 * shortcut: no rollback; every engine path either fails before its first write or commits, and the race test (Task 4)
 * covers real Postgres.
 */
export function fakeStore(db: Db): Store {
  const locks = new Map<string, Promise<void>>()
  let seq = 0
  // UUID-shaped, so ids pass the handler's body check.
  const id = (_p: string) => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  return {
    async tx(fn) {
      const held: (() => void)[] = []
      const lock = async (key: string) => {
        const prev = locks.get(key) ?? Promise.resolve()
        let release!: () => void
        const mine = new Promise<void>((r) => { release = r })
        locks.set(key, prev.then(() => mine))
        await prev
        held.push(release)
      }
      const tx: Tx = {
        workflow: async (wid) => { await tick(); return db.workflows.find((w) => w.id === wid) ?? null },
        lockRecord: async (rid) => {
          await lock(`r:${rid}`)
          const r = db.records.find((x) => x.id === rid)
          return r ? structuredClone(r) : null
        },
        task: async (tid) => { await tick(); const t = db.tasks.find((x) => x.id === tid); return t ? { ...t } : null },
        form: async (fid, org) => db.forms.find((f) => f.id === fid && f.org_id === org) ?? null,
        can: async (user, _org, _perm, wid) => db.starters.has(`${user}:${wid}`),
        isActiveMember: async (user, org) => db.members.some((m) => m.user_id === user && m.org_id === org),
        holdsRole: async (user, _org, role) => db.holders.has(`${user}:${role}`),
        roleExists: async (role, org) => db.roles.some((r) => r.id === role && r.org_id === org),
        lastSubmitter: async (rid, nid) => db.submissions.filter((s) => s.record_id === rid && s.node_id === nid).at(-1)?.submitted_by ?? null,
        insertRecord: async (row) => {
          const r: RecordRow = { ...row, id: id('rec'), current_node_id: null, status: 'open', label: null, error: null, step: 0 }
          db.records.push(r)
          await lock(`r:${r.id}`)
          return structuredClone(r)
        },
        saveRecord: async (rec) => { db.records[db.records.findIndex((x) => x.id === rec.id)] = structuredClone(rec) },
        insertSubmission: async (row) => {
          if (row.task_id && db.submissions.some((s) => s.task_id === row.task_id)) throw new Error('duplicate key value violates unique constraint "form_submissions_task_id_key"')
          const s = { ...row, id: id('sub') }
          db.submissions.push(s)
          return s.id
        },
        finishTask: async (tid) => {
          await tick()
          const t = db.tasks.find((x) => x.id === tid && x.status === 'open')
          if (!t) return false
          t.status = 'done'
          return true
        },
        insertTask: async (row) => {
          if (db.tasks.some((t) => t.record_id === row.record_id && t.status === 'open')) throw new Error('duplicate key value violates unique constraint "tasks_one_open_per_record"')
          const t = { ...row, id: id('task'), claimed_by: null, status: 'open' as const, overdue_notified_at: null }
          db.tasks.push(t)
          return t.id
        },
        schedule: async (row) => { db.scheduled.push({ ...row, id: id('sched'), status: 'pending', error: null }) },
        event: async (row) => { db.events.push(row) },
        dueScheduled: async (now, limit) => db.scheduled.filter((s) => s.status === 'pending' && s.run_at <= now).slice(0, limit).map((s) => s.id),
        lockScheduled: async (sid) => {
          await lock(`s:${sid}`)
          const s = db.scheduled.find((x) => x.id === sid && x.status === 'pending')
          return s ? { id: s.id, org_id: s.org_id, record_id: s.record_id, resume_node_id: s.resume_node_id, state_at_schedule: s.state_at_schedule } : null
        },
        finishScheduled: async (sid, status, error) => {
          const s = db.scheduled.find((x) => x.id === sid)
          if (s) { s.status = status; s.error = error }
        },
        orgName: async () => db.orgName,
        template: async (org, ref) =>
          db.templates.find((x) => x.org_id === org && ('id' in ref ? x.id === ref.id : x.kind === ref.kind && x.kind !== 'custom')) ?? null,
        peopleByIds: async (org, ids) => db.members.filter((m) => m.org_id === org && ids.includes(m.user_id)).map(person),
        peopleInRole: async (org, role) => db.members.filter((m) => m.org_id === org && db.holders.has(`${m.user_id}:${role}`)).map(person).slice(0, 501),
        roleName: async (role, org) => db.roles.find((r) => r.id === role && r.org_id === org)?.name ?? null,
        emailMuted: async (ids, kind) => new Set(ids.filter((u) => db.muted.has(`${u}:${kind}`))),
        notify: async (rows) => { db.notifications.push(...rows) },
        queueMessages: async (rows) => {
          // next_attempt_at: due at once, like the column default now()
          for (const r of rows) db.messages.push({ ...r, id: id('msg'), status: 'queued', attempts: 0, error: null, next_attempt_at: new Date(0), sent_at: null, provider_id: null })
        },
        overdueTasks: async (now, limit) => db.tasks
          .filter((t) => t.status === 'open' && !t.overdue_notified_at && t.due_at && t.due_at <= now)
          .slice(0, limit).map((t) => ({ id: t.id, record_id: t.record_id })),
        markOverdue: async (tid, now) => {
          await lock(`t:${tid}`)
          await tick()
          const t = db.tasks.find((x) => x.id === tid && x.status === 'open' && !x.overdue_notified_at && x.due_at && x.due_at <= now)
          if (!t) return null
          t.overdue_notified_at = now
          return { ...t }
        },
        dueMessages: async (now, limit) => db.messages.filter((m) => m.status === 'queued' && m.next_attempt_at <= now).slice(0, limit).map((m) => m.id),
        lockMessage: async (mid, now) => {
          await lock(`m:${mid}`)
          const m = db.messages.find((x) => x.id === mid && x.status === 'queued' && x.next_attempt_at <= now)
          return m ? { id: m.id, org_id: m.org_id, recipient_email: m.recipient_email, subject: m.subject, body_html: m.body_html, body_text: m.body_text, attempts: m.attempts } : null
        },
        finishMessage: async (mid, p) => {
          const m = db.messages.find((x) => x.id === mid)
          if (!m) return
          m.status = p.status
          m.attempts = p.attempts
          m.error = p.error
          if (p.nextAttemptAt) m.next_attempt_at = p.nextAttemptAt
          if (p.sentAt) m.sent_at = p.sentAt
          if (p.providerId !== undefined) m.provider_id = p.providerId
        },
        hasReportTemplate: async (wf) => db.reportTemplates.has(wf),
        queuePdf: async (x) => {
          const queued = db.pdfs.find((p) => p.record_id === x.record_id && p.status === 'queued')
          if (queued) return queued.id
          const p = { ...x, id: id('pdf'), attempts: 0, status: 'queued' as const, next_attempt_at: new Date(0), path: null, error: null }
          db.pdfs.push(p)
          return p.id
        },
        duePdfs: async (now, limit) => db.pdfs.filter((p) => p.status === 'queued' && p.attempts < 3 && p.next_attempt_at <= now).slice(0, limit).map((p) => p.id),
        claimPdf: async (pid, now, lease) => {
          await tick() // let an overlapping run reach the same row
          const p = db.pdfs.find((x) => x.id === pid && x.status === 'queued' && x.attempts < 3 && x.next_attempt_at <= now)
          if (!p) return null
          p.attempts += 1
          p.next_attempt_at = lease
          return { id: p.id, org_id: p.org_id, record_id: p.record_id, requested_by: p.requested_by, attempts: p.attempts }
        },
        expiredPdfs: async (now, limit) => db.pdfs.filter((p) => p.status === 'queued' && p.attempts >= 3 && p.next_attempt_at <= now).slice(0, limit)
          .map((p) => ({ id: p.id, org_id: p.org_id, record_id: p.record_id, requested_by: p.requested_by, attempts: p.attempts })),
        finishPdf: async (pid, patch) => {
          const p = db.pdfs.find((x) => x.id === pid && x.status === 'queued')
          if (!p) return false
          p.status = patch.status
          p.error = patch.error
          p.path = patch.path ?? null
          if (patch.nextAttemptAt) p.next_attempt_at = patch.nextAttemptAt
          return true
        },
        pdfSource: async (rid) => structuredClone(db.pdfSources.get(rid) ?? null),
      }
      try { return await fn(tx) } finally { for (const r of held) r() }
    },
  }
}

export const APP = 'http://localhost:5173/app/'
export const GONE = '00000000-0000-0000-0000-0000000000a9' // never a member

const tpl = (id: string, kind: TemplateRow['kind'], name: string, subject: string, body: string): TemplateRow =>
  ({ id, org_id: ORG, kind, name, channel: 'email', subject, body })
const TEMPLATES: TemplateRow[] = [
  tpl('0000000a-0000-0000-0000-00000000a0e0', 'task_assigned', 'Task assigned', 'New task: {{record.title}}',
    'Hello {{recipient.name}}, "{{record.title}}" needs {{step.assignee.name}}: {{link.task}}'),
  tpl('0000000a-0000-0000-0000-00000000a0e2', 'task_overdue', 'Task overdue', 'Overdue: {{record.title}}', 'Still waiting on {{step.assignee.name}}: {{link.task}}'),
  tpl(T_APPROVED, 'record_approved', 'Record approved', 'Approved: {{record.title}}', '{{step.assignee.name}} approved it. {{link.record}}'),
  tpl('0000000a-0000-0000-0000-00000000a0e3', 'record_rejected', 'Record rejected', 'Rejected: {{record.title}}', 'See {{link.record}}'),
  tpl('0000000a-0000-0000-0000-00000000a0e4', 'invite', 'Invite to org', 'Join {{org.name}}', '{{link.invite}}'),
]

export const NOW = new Date('2026-10-11T12:00:00Z')
export const BETA_USER = '00000000-0000-0000-0000-0000000000b1'

/** The seeded Leave approval, one member who may start it, one admin holding the approval role. */
export function setup(graph: Graph = LEAVE) {
  const db: Db = {
    workflows: [{ id: WF, org_id: ORG, name: 'Leave approval', status: 'published', graph }],
    forms: [{ id: F_LEAVE, org_id: ORG, schema: FORM }, { id: F_APPROVAL, org_id: ORG, schema: [{ key: 'comment', type: 'long_text', label: 'Comment' }] }],
    members: [
      { user_id: MEMBER, org_id: ORG, email: 'member@alpha.test', name: 'member@alpha.test' },
      { user_id: ADMIN, org_id: ORG, email: 'admin@alpha.test', name: 'admin@alpha.test' },
    ],
    roles: [{ id: ROLE_ADMIN, org_id: ORG, name: 'Admin' }],
    orgName: 'Alpha School',
    templates: structuredClone(TEMPLATES),
    muted: new Set(),
    notifications: [], messages: [],
    holders: new Set([`${ADMIN}:${ROLE_ADMIN}`]),
    starters: new Set([`${MEMBER}:${WF}`]),
    reportTemplates: new Set([WF]), pdfs: [], pdfSources: new Map(),
    records: [], tasks: [], submissions: [], scheduled: [], events: [],
  }
  const store = fakeStore(db)
  const ctx = (actor: string): Ctx => ({ now: NOW, actor, appUrl: APP, fileExists: () => Promise.resolve(true) })
  const start = (answers: Record<string, unknown> = VALID, actor = MEMBER) =>
    store.tx((tx) => startRecord(tx, { workflowId: WF, answers }, ctx(actor)))
  const act = (taskId: string, outcome: string, actor = ADMIN, answers: Record<string, unknown> = { comment: 'Fine' }) =>
    store.tx((tx) => submitTask(tx, { taskId, outcome, answers }, ctx(actor)))
  /** Stands in for claim_task (Task 2), which is SQL. */
  const claim = (actor = ADMIN) => { const t = db.tasks.find((x) => x.status === 'open')!; t.claimed_by = actor; return t.id }
  const resume = async (now: Date) => {
    const ids = await store.tx((tx) => tx.dueScheduled(now, 50))
    return Promise.all(ids.map((sid) => store.tx((tx) => resumeOne(tx, sid, { now, appUrl: APP }))))
  }
  return { db, store, start, act, claim, resume }
}
