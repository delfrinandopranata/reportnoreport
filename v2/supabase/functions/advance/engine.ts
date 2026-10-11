import { evaluate, missingUploads, validateAnswers, validateSchema, type Answers, type Field } from '../_shared/forms/index.ts'
import {
  durationMs, nextEdge, nodeById, nodeName, outcomesOf, readGraph, timeRunAt,
  type Edge, type FormNode, type Graph, type Outcome, type StartNode,
} from '../_shared/workflow/graph.ts'
import { notifyTask, sendAction, type MessagePatch, type MessageRow, type NewMessage, type NewNotification, type Person, type TemplateRow } from './notify.ts'
import type { TemplateKind } from '../_shared/comms/recipients.ts'

export type RecordStatus = 'open' | 'done' | 'rejected' | 'error'
export type RecordRow = {
  id: string; org_id: string; workflow_id: string; title: string; current_node_id: string | null
  status: RecordStatus; label: string | null; error: string | null; data: Answers; step: number; started_by: string
}
export type WorkflowRow = { id: string; org_id: string; name: string; status: 'draft' | 'published'; graph: unknown }
export type TaskRow = {
  id: string; org_id: string; record_id: string; node_id: string
  assignee_role_id: string | null; assignee_user_id: string | null; claimed_by: string | null; status: 'open' | 'done' | 'cancelled'
}
export type ScheduledRow = { id: string; org_id: string; record_id: string; resume_node_id: string; state_at_schedule: number }
export type EventKind = 'started' | 'submitted' | 'task' | 'condition' | 'waiting' | 'resumed' | 'skipped' | 'action' | 'error' | 'closed'
export type NewRecord = Pick<RecordRow, 'org_id' | 'workflow_id' | 'title' | 'data' | 'started_by'>
export type NewSubmission = {
  org_id: string; record_id: string; node_id: string; form_id: string; task_id: string | null
  answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'
}
export type NewTask = { org_id: string; record_id: string; node_id: string; assignee_role_id: string | null; assignee_user_id: string | null; due_at: Date | null }
export type NewEvent = { org_id: string; record_id: string; kind: EventKind; node_id: string | null; actor_id: string | null; detail: Record<string, unknown> }

/** One database transaction. The pg adapter (Task 4) and the test fake both implement it. */
export interface Tx {
  /** FOR SHARE: a concurrent save-workflow waits until this transaction ends. */
  workflow(id: string): Promise<WorkflowRow | null>
  /** FOR UPDATE: one advance per record at a time; a second one waits, then sees the first one's result. */
  lockRecord(id: string): Promise<RecordRow | null>
  task(id: string): Promise<TaskRow | null>
  form(id: string, orgId: string): Promise<{ id: string; schema: unknown } | null>
  /** has_permission(org, perm, workflow) evaluated as `userId`. */
  can(userId: string, orgId: string, perm: string, workflowId: string): Promise<boolean>
  isActiveMember(userId: string, orgId: string): Promise<boolean>
  roleExists(roleId: string, orgId: string): Promise<boolean>
  holdsRole(userId: string, orgId: string, roleId: string): Promise<boolean>
  lastSubmitter(recordId: string, nodeId: string): Promise<string | null>
  insertRecord(row: NewRecord): Promise<RecordRow>
  saveRecord(rec: RecordRow): Promise<void>
  insertSubmission(row: NewSubmission): Promise<string>
  /** open → done; false when it was no longer open. */
  finishTask(id: string): Promise<boolean>
  insertTask(row: NewTask): Promise<string>
  schedule(row: { org_id: string; record_id: string; resume_node_id: string; run_at: Date; state_at_schedule: number }): Promise<void>
  event(row: NewEvent): Promise<void>
  dueScheduled(now: Date, limit: number): Promise<string[]>
  /** FOR UPDATE SKIP LOCKED, pending rows only. */
  lockScheduled(id: string): Promise<ScheduledRow | null>
  finishScheduled(id: string, status: 'done' | 'skipped' | 'failed', error: string | null): Promise<void>
  orgName(orgId: string): Promise<string>
  template(orgId: string, ref: { id: string } | { kind: TemplateKind }): Promise<TemplateRow | null>
  /** Active members among these users. */
  peopleByIds(orgId: string, userIds: string[]): Promise<Person[]>
  /** Active holders of the role, by email, at most MAX_PEOPLE. */
  peopleInRole(orgId: string, roleId: string): Promise<Person[]>
  roleName(roleId: string, orgId: string): Promise<string | null>
  /** Of these users, the ones who turned email off for this kind. */
  emailMuted(userIds: string[], kind: TemplateKind): Promise<Set<string>>
  notify(rows: NewNotification[]): Promise<void>
  queueMessages(rows: NewMessage[]): Promise<void>
  /** Open, unreminded tasks past due, oldest first. */
  overdueTasks(now: Date, limit: number): Promise<{ id: string; record_id: string }[]>
  /** Sets overdue_notified_at once; null when another run did, or the task is done or not due. */
  markOverdue(taskId: string, now: Date): Promise<TaskRow | null>
  dueMessages(now: Date, limit: number): Promise<string[]>
  /** FOR UPDATE SKIP LOCKED, queued and due rows only. */
  lockMessage(id: string, now: Date): Promise<MessageRow | null>
  finishMessage(id: string, patch: MessagePatch): Promise<void>
}
export interface Store { tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> }
export type Ctx = { now: Date; actor: string; appUrl: string; fileExists(path: string): Promise<boolean> }
export type WalkCtx = { now: Date; actor: string | null; appUrl: string }
export type Result = { status: number; body: Record<string, unknown> }

/** A step that cannot run: the record stops in `error` with this message, which is shown to people as is. */
export class StepError extends Error {}

const MAX_HOPS = 100
const SETUP = 'This workflow has a setup problem. Ask a workflow manager to fix it.'
const NO_WORKFLOW = 'This workflow does not exist or you do not have access to it.'
const NO_TASK = 'This task does not exist or you do not have access to it.'
const SOME_ANSWERS = 'Some answers need fixing.'
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, body: { error, ...extra } })
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** "Workflow name: first short-text answer", else the workflow name. */
export function recordTitle(fields: Field[], answers: Answers, fallback: string): string {
  const f = fields.find((x) => x.type === 'short_text' && typeof answers[x.key] === 'string' && (answers[x.key] as string).trim())
  return (f ? `${fallback}: ${(answers[f.key] as string).trim()}` : fallback).slice(0, 200)
}

type Checked = { ok: true; fields: Field[]; answers: Answers } | { ok: false; res: Result }

/** Same authority as submit-form: hidden answers stripped, calculated values recomputed, uploads proven. */
async function checkAnswers(tx: Tx, orgId: string, formId: string, raw: Answers, ctx: Ctx): Promise<Checked> {
  const form = await tx.form(formId, orgId)
  if (!form || validateSchema(form.schema).length) return { ok: false, res: fail(409, SETUP) }
  const fields = form.schema as Field[]
  const checked = validateAnswers(fields, raw, { now: ctx.now, filePrefix: `${orgId}/${ctx.actor}/` })
  if (!checked.ok) return { ok: false, res: fail(400, SOME_ANSWERS, { fieldErrors: checked.errors }) }
  const missing = await missingUploads(fields, checked.answers, ctx.fileExists)
  if (Object.keys(missing).length) return { ok: false, res: fail(400, SOME_ANSWERS, { fieldErrors: missing }) }
  return { ok: true, fields, answers: checked.answers }
}

export async function startRecord(tx: Tx, input: { workflowId: string; answers: Answers }, ctx: Ctx): Promise<Result> {
  const wf = await tx.workflow(input.workflowId)
  if (!wf || !(await tx.isActiveMember(ctx.actor, wf.org_id))) return fail(404, NO_WORKFLOW)
  if (wf.status !== 'published') return fail(409, 'This workflow is not published yet.')
  if (!(await tx.can(ctx.actor, wf.org_id, 'records.start', wf.id))) return fail(403, 'You cannot start this workflow. Ask an admin for access.')
  const graph = readGraph(wf.graph)
  const start = graph?.nodes.find((n): n is StartNode => n.type === 'start')
  if (!graph || !start) return fail(409, SETUP)
  const checked = await checkAnswers(tx, wf.org_id, start.formId, input.answers, ctx)
  if (!checked.ok) return checked.res

  const rec = await tx.insertRecord({
    org_id: wf.org_id, workflow_id: wf.id, title: recordTitle(checked.fields, checked.answers, wf.name), data: checked.answers, started_by: ctx.actor,
  })
  rec.current_node_id = start.id
  const submissionId = await tx.insertSubmission({
    org_id: wf.org_id, record_id: rec.id, node_id: start.id, form_id: start.formId, task_id: null,
    answers: checked.answers, submitted_by: ctx.actor, outcome: 'submitted',
  })
  await tx.event({ org_id: wf.org_id, record_id: rec.id, kind: 'started', node_id: start.id, actor_id: ctx.actor, detail: { submissionId } })
  const after = await walk(tx, rec, graph, start.id, 'submitted', ctx)
  return { status: 200, body: { recordId: rec.id, status: after.status, error: after.status === 'error' ? after.error : null } }
}

export async function submitTask(tx: Tx, input: { taskId: string; outcome: string; answers: Answers }, ctx: Ctx): Promise<Result> {
  const peek = await tx.task(input.taskId) // a task never changes record, so reading it before the lock is safe
  if (!peek) return fail(404, NO_TASK)
  const rec = await tx.lockRecord(peek.record_id)
  const task = await tx.task(input.taskId) // re-read under the lock: a concurrent submit has committed by now
  if (!rec || !task || !(await tx.isActiveMember(ctx.actor, task.org_id))) return fail(404, NO_TASK)
  if (task.status !== 'open') return fail(409, 'This task is already done.')
  if (task.assignee_user_id !== ctx.actor && task.claimed_by !== ctx.actor) {
    // Same refusal as claim_task: a non-holder is told nothing about the task.
    if (task.assignee_role_id && !(await tx.holdsRole(ctx.actor, task.org_id, task.assignee_role_id))) return fail(403, 'Not allowed.')
    return task.assignee_role_id && !task.claimed_by
      ? fail(409, 'Claim this task before you act on it.')
      : fail(403, 'This task is assigned to someone else.')
  }
  if (rec.status !== 'open' || rec.current_node_id !== task.node_id) return fail(409, 'This record has moved on. Reload to see where it is now.')

  const graph = readGraph((await tx.workflow(rec.workflow_id))?.graph)
  const node = graph ? nodeById(graph, task.node_id) : undefined
  if (!graph || !node || node.type !== 'form') return fail(409, SETUP)
  const outcome = outcomesOf(node).find((o) => o === input.outcome)
  if (!outcome) return fail(400, node.mode === 'approve' ? 'Choose Approve or Reject.' : 'Send the outcome "submitted".')
  const checked = await checkAnswers(tx, rec.org_id, node.formId, input.answers, ctx)
  if (!checked.ok) return checked.res
  if (!(await tx.finishTask(task.id))) return fail(409, 'This task is already done.')

  const submissionId = await tx.insertSubmission({
    org_id: rec.org_id, record_id: rec.id, node_id: node.id, form_id: node.formId, task_id: task.id,
    answers: checked.answers, submitted_by: ctx.actor, outcome: outcome as NewSubmission['outcome'],
  })
  rec.data = { ...rec.data, ...checked.answers }
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'submitted', node_id: node.id, actor_id: ctx.actor, detail: { submissionId, outcome, taskId: task.id } })
  const after = await walk(tx, rec, graph, node.id, outcome, ctx)
  return { status: 200, body: { recordId: rec.id, status: after.status, error: after.status === 'error' ? after.error : null } }
}

/**
 * Follows `outcome` out of `from` until the record waits (Form, Time) or closes (End). Saves the record.
 * A StepError stops the walk where it is and puts the record in `error`; it is never skipped (spec §5.4, §10).
 */
export async function walk(tx: Tx, rec: RecordRow, graph: Graph, from: string, outcome: Outcome, ctx: WalkCtx): Promise<RecordRow> {
  const ev = (kind: EventKind, nodeId: string | null, detail: Record<string, unknown> = {}) =>
    tx.event({ org_id: rec.org_id, record_id: rec.id, kind, node_id: nodeId, actor_id: ctx.actor, detail })
  let at = from
  let out = outcome
  try {
    for (let hop = 0; ; hop++) {
      if (hop >= MAX_HOPS) throw new StepError('This workflow loops without stopping. Ask a workflow manager to add a Form or Time step to the loop.')
      const edge = nextEdge(graph, at, out)
      if (!edge) throw new StepError(`"${nodeName(nodeById(graph, at))}" has no path for "${out}". Ask a workflow manager to connect it.`)
      for (const a of edge.actions) await runAction(tx, rec, edge, a, ctx, ev)
      const node = nodeById(graph, edge.to)
      if (!node) throw new StepError('The next step was deleted. Ask a workflow manager to reconnect this path.')
      rec.current_node_id = node.id
      rec.step += 1
      if (node.type === 'condition') {
        out = evaluate(node.rule, rec.data, ctx.now) ? 'yes' : 'no'
        at = node.id
        await ev('condition', node.id, { outcome: out })
        continue
      }
      if (node.type === 'form') { await createTask(tx, rec, node, ctx, ev); break }
      if (node.type === 'time') {
        const runAt = timeRunAt(node, rec.data, ctx.now)
        if (!runAt) throw new StepError(`"${nodeName(node)}" needs a valid date in its date field.`)
        await tx.schedule({ org_id: rec.org_id, record_id: rec.id, resume_node_id: node.id, run_at: runAt, state_at_schedule: rec.step })
        await ev('waiting', node.id, { runAt: runAt.toISOString() })
        break
      }
      if (node.type === 'end') { rec.status = node.status; await ev('closed', node.id, { status: node.status }); break }
      throw new StepError('A workflow cannot return to its Start step.')
    }
  } catch (e) {
    if (!(e instanceof StepError)) throw e
    rec.status = 'error'
    rec.error = e.message
    await ev('error', rec.current_node_id, { message: e.message })
  }
  await tx.saveRecord(rec)
  return rec
}

type Ev = (k: EventKind, n: string | null, d?: Record<string, unknown>) => Promise<void>

async function runAction(tx: Tx, rec: RecordRow, edge: Edge, a: unknown, ctx: WalkCtx, ev: Ev) {
  if (isObj(a) && a.type === 'set_status') {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    if (!label || label.length > 60) throw new StepError('A "Set status" action on this path has no status text. Ask a workflow manager to fix it.')
    rec.label = label
    return ev('action', edge.from, { type: 'set_status', edge: edge.id, label })
  }
  if (isObj(a) && a.type === 'send_message') {
    const sent = await sendAction(tx, rec, edge.from, a, ctx)
    return ev('action', edge.from, { type: 'send_message', edge: edge.id, ...sent })
  }
  if (isObj(a) && a.type === 'generate_pdf') {
    // shortcut: recorded as pending only; Phase 5 (Reports) processes pending generate_pdf events.
    return ev('action', edge.from, { type: a.type, edge: edge.id, status: 'pending', config: a })
  }
  throw new StepError('This path has an action the workflow cannot run. Ask a workflow manager to remove it.')
}

async function createTask(tx: Tx, rec: RecordRow, node: FormNode, ctx: WalkCtx, ev: Ev) {
  const a: unknown = node.assignee
  const name = nodeName(node)
  let role: string | null = null
  let user: string | null = null
  if (isObj(a) && typeof a.role === 'string' && a.role) {
    if (!(await tx.roleExists(a.role, rec.org_id))) throw new StepError(`The role for "${name}" no longer exists. Ask a workflow manager to choose another.`)
    role = a.role
  } else if (isObj(a) && typeof a.user === 'string' && a.user) {
    if (!(await tx.isActiveMember(a.user, rec.org_id))) throw new StepError(`The person assigned to "${name}" is no longer a member.`)
    user = a.user
  } else if (isObj(a) && typeof a.step === 'string' && a.step) {
    user = await tx.lastSubmitter(rec.id, a.step)
    if (!user) throw new StepError(`Nobody has submitted the step that "${name}" is assigned from.`)
  } else {
    throw new StepError(`"${name}" has nobody assigned. Ask a workflow manager to choose someone.`)
  }
  const due = node.due ? durationMs(node.due) : null
  const dueAt = due === null ? null : new Date(ctx.now.getTime() + due)
  const taskId = await tx.insertTask({ org_id: rec.org_id, record_id: rec.id, node_id: node.id, assignee_role_id: role, assignee_user_id: user, due_at: dueAt })
  const sent = await notifyTask(tx, 'task_assigned', rec, { id: taskId, node_id: node.id, assignee_role_id: role, assignee_user_id: user, claimed_by: null }, ctx)
  await ev('task', node.id, { taskId, role, user, dueAt: dueAt?.toISOString() ?? null, notified: sent.notices, emailed: sent.emails })
}

/** Continues one due Time step, or skips it when the record left that step (or closed) since it was scheduled. */
export async function resumeOne(tx: Tx, id: string, ctx: { now: Date; appUrl: string }): Promise<'done' | 'skipped' | 'failed' | 'gone'> {
  const row = await tx.lockScheduled(id)
  if (!row) return 'gone' // another resume took it, or it is no longer pending
  const rec = await tx.lockRecord(row.record_id)
  if (!rec || rec.status !== 'open' || rec.step !== row.state_at_schedule) {
    await tx.finishScheduled(id, 'skipped', null)
    if (rec) await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'skipped', node_id: row.resume_node_id, actor_id: null, detail: {} })
    return 'skipped'
  }
  const graph = readGraph((await tx.workflow(rec.workflow_id))?.graph) ?? { nodes: [], edges: [] }
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'resumed', node_id: row.resume_node_id, actor_id: null, detail: {} })
  const after = await walk(tx, rec, graph, row.resume_node_id, 'next', { now: ctx.now, actor: null, appUrl: ctx.appUrl })
  const failed = after.status === 'error'
  await tx.finishScheduled(id, failed ? 'failed' : 'done', failed ? after.error : null)
  return failed ? 'failed' : 'done'
}

/** An unexpected error rolled a resume back: record it on the row and the record, so it is never retried silently. */
export async function failScheduled(tx: Tx, id: string, message: string): Promise<void> {
  const row = await tx.lockScheduled(id)
  if (!row) return
  await tx.finishScheduled(id, 'failed', message)
  const rec = await tx.lockRecord(row.record_id)
  if (!rec || rec.status !== 'open') return
  rec.status = 'error'
  rec.error = message
  await tx.saveRecord(rec)
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'error', node_id: rec.current_node_id, actor_id: null, detail: { message } })
}
