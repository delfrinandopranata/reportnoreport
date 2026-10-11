import type { NewEvent, NewSubmission, RecordRow, ScheduledRow, Store, TaskRow, Tx, WorkflowRow } from './engine.ts'
import { startRecord, submitTask, resumeOne, type Ctx } from './engine.ts'
import type { Graph } from '../_shared/workflow/graph.ts'
import { FORM, ORG, VALID } from '../_shared/forms/fixture.ts'
import { ADMIN, F_APPROVAL, F_LEAVE, LEAVE, MEMBER, ROLE_ADMIN, WF } from '../_shared/workflow/fixture.ts'

type Sched = ScheduledRow & { run_at: Date; status: 'pending' | 'done' | 'skipped' | 'failed'; error: string | null }
export type Db = {
  workflows: WorkflowRow[]
  forms: { id: string; org_id: string; schema: unknown }[]
  members: { user_id: string; org_id: string }[]
  roles: { id: string; org_id: string }[]
  starters: Set<string> // `${userId}:${workflowId}` pairs that pass has_permission(org, 'records.start', workflow)
  records: RecordRow[]
  tasks: (TaskRow & { due_at: Date | null })[]
  submissions: (NewSubmission & { id: string })[]
  scheduled: Sched[]
  events: NewEvent[]
}

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
  const id = (p: string) => `${p}-${++seq}`
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
          const t = { ...row, id: id('task'), claimed_by: null, status: 'open' as const }
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
      }
      try { return await fn(tx) } finally { for (const r of held) r() }
    },
  }
}

export const NOW = new Date('2026-10-11T12:00:00Z')
export const BETA_USER = '00000000-0000-0000-0000-0000000000b1'

/** The seeded Leave approval, one member who may start it, one admin holding the approval role. */
export function setup(graph: Graph = LEAVE) {
  const db: Db = {
    workflows: [{ id: WF, org_id: ORG, name: 'Leave approval', status: 'published', graph }],
    forms: [{ id: F_LEAVE, org_id: ORG, schema: FORM }, { id: F_APPROVAL, org_id: ORG, schema: [{ key: 'comment', type: 'long_text', label: 'Comment' }] }],
    members: [{ user_id: MEMBER, org_id: ORG }, { user_id: ADMIN, org_id: ORG }],
    roles: [{ id: ROLE_ADMIN, org_id: ORG }],
    starters: new Set([`${MEMBER}:${WF}`]),
    records: [], tasks: [], submissions: [], scheduled: [], events: [],
  }
  const store = fakeStore(db)
  const ctx = (actor: string): Ctx => ({ now: NOW, actor, fileExists: () => Promise.resolve(true) })
  const start = (answers: Record<string, unknown> = VALID, actor = MEMBER) =>
    store.tx((tx) => startRecord(tx, { workflowId: WF, answers }, ctx(actor)))
  const act = (taskId: string, outcome: string, actor = ADMIN, answers: Record<string, unknown> = { comment: 'Fine' }) =>
    store.tx((tx) => submitTask(tx, { taskId, outcome, answers }, ctx(actor)))
  /** Stands in for claim_task (Task 2), which is SQL. */
  const claim = (actor = ADMIN) => { const t = db.tasks.find((x) => x.status === 'open')!; t.claimed_by = actor; return t.id }
  const resume = async (now: Date) => {
    const ids = await store.tx((tx) => tx.dueScheduled(now, 50))
    return Promise.all(ids.map((sid) => store.tx((tx) => resumeOne(tx, sid, now))))
  }
  return { db, store, start, act, claim, resume }
}
