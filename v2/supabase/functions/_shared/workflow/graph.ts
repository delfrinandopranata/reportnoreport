import { OPERATORS, type Answers, type Rule } from '../forms/types.ts'
import { parsePath, toDay } from '../forms/rules.ts'
import { sendMessageIssue, type SendMessage } from '../comms/recipients.ts'

export const NODE_TYPES = ['start', 'form', 'condition', 'time', 'end'] as const
export type NodeType = (typeof NODE_TYPES)[number]
export const OUTCOMES = ['submitted', 'approved', 'rejected', 'yes', 'no', 'next'] as const
export type Outcome = (typeof OUTCOMES)[number]
export const UNITS = ['minutes', 'hours', 'days'] as const
export type Unit = (typeof UNITS)[number]
export type Duration = { amount: number; unit: Unit }
export type Assignee = { role: string } | { user: string } | { step: string }
export type Relative = { field: string; amount: number; unit: Unit; direction: 'before' | 'after' }

type Base = { id: string; label?: string; position: { x: number; y: number } }
export type StartNode = Base & { type: 'start'; formId: string }
export type FormNode = Base & { type: 'form'; formId: string; assignee: Assignee; mode: 'fill' | 'approve'; due?: Duration }
export type ConditionNode = Base & { type: 'condition'; rule: Rule }
export type TimeNode = Base & { type: 'time'; after?: Duration; relative?: Relative }
export type EndNode = Base & { type: 'end'; status: 'done' | 'rejected' }
export type WfNode = StartNode | FormNode | ConditionNode | TimeNode | EndNode

export type Action =
  | { type: 'set_status'; label: string }
  | SendMessage
  | { type: 'generate_pdf' }
export type Edge = { id: string; from: string; outcome: Outcome; to: string; actions: Action[] }
export type Graph = { nodes: WfNode[]; edges: Edge[] }
export type Issue = { message: string; nodeId?: string; edgeId?: string }
export type Refs = { forms: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string>; templates: ReadonlySet<string> }

export const ID_RE = /^[a-z0-9_-]{1,40}$/
export const MAX_NODES = 200
export const TYPE_LABELS: Record<NodeType, string> = { start: 'Start', form: 'Form', condition: 'Condition', time: 'Time', end: 'End' }
export const OUTCOME_LABELS: Record<Outcome, string> = {
  submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', yes: 'Yes', no: 'No', next: 'Next',
}
const UNIT_MS: Record<Unit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }
const MAX_MS = 366 * UNIT_MS.days
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUnit = (u: unknown): u is Unit => (UNITS as readonly unknown[]).includes(u)
const outcomeLabel = (o: string) => (OUTCOME_LABELS as Record<string, string>)[o] ?? o

export const nodeName = (n: WfNode | undefined) =>
  n ? n.label?.trim() || (TYPE_LABELS as Record<string, string>)[n.type] || 'Step' : 'A deleted step'

export function outcomesOf(n: WfNode): Outcome[] {
  switch (n.type) {
    case 'start': return ['submitted']
    case 'form': return n.mode === 'approve' ? ['approved', 'rejected'] : ['submitted']
    case 'condition': return ['yes', 'no']
    case 'time': return ['next']
    default: return []
  }
}

export const nodeById = (g: Graph, id: string) => g.nodes.find((n) => n.id === id)
export const nextEdge = (g: Graph, from: string, outcome: Outcome) =>
  g.edges.find((e) => e.from === from && e.outcome === outcome) ?? null

/** A whole number of minutes, hours or days, more than zero and at most 366 days. */
export function durationMs(d: unknown): number | null {
  if (!isObj(d) || !Number.isInteger(d.amount) || !isUnit(d.unit)) return null
  const ms = (d.amount as number) * UNIT_MS[d.unit]
  return ms > 0 && ms <= MAX_MS ? ms : null
}

/** Offset of a date-relative Time step; zero is allowed ("on the day"). */
function relativeMs(r: unknown): number | null {
  if (!isObj(r) || !Number.isInteger(r.amount) || (r.amount as number) < 0 || !isUnit(r.unit)) return null
  if (r.direction !== 'before' && r.direction !== 'after') return null
  const p = parsePath(r.field)
  if (!p || p.col || p.count) return null
  const ms = (r.amount as number) * UNIT_MS[r.unit]
  return ms <= MAX_MS ? (r.direction === 'before' ? -ms : ms) : null
}

/** When a Time step resumes; null when its date field is empty or unreadable. Dates are UTC days (Phase 2). */
export function timeRunAt(node: TimeNode, data: Answers, now: Date): Date | null {
  if (node.after) {
    const ms = durationMs(node.after)
    return ms === null ? null : new Date(now.getTime() + ms)
  }
  const offset = relativeMs(node.relative)
  const day = node.relative ? toDay(data?.[node.relative.field]) : null
  return offset === null || day === null ? null : new Date(day * UNIT_MS.days + offset)
}

/** Shape only, so a draft with gaps can be stored and drawn; checkGraph judges the content. */
export function readGraph(raw: unknown): Graph | null {
  if (!isObj(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null
  const okNode = (n: unknown) => isObj(n) && typeof n.id === 'string' && typeof n.type === 'string' &&
    isObj(n.position) && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
  const okEdge = (e: unknown) => isObj(e) && typeof e.id === 'string' && typeof e.from === 'string' &&
    typeof e.to === 'string' && typeof e.outcome === 'string' && Array.isArray(e.actions)
  return raw.nodes.every(okNode) && raw.edges.every(okEdge) ? (raw as unknown as Graph) : null
}

/** The publish check (spec §5.3). Never throws; every issue names the step or connection it is pinned to. */
export function checkGraph(raw: unknown, refs: Refs): Issue[] {
  const g = readGraph(raw)
  if (!g) return [{ message: 'This workflow could not be read. Reload the page.' }]
  const issues: Issue[] = []
  const add = (message: string, at: { nodeId?: string; edgeId?: string } = {}) => { issues.push({ message, ...at }) }
  if (g.nodes.length > MAX_NODES) add(`Keep a workflow under ${MAX_NODES} steps.`)

  const byId = new Map<string, WfNode>()
  for (const n of g.nodes) {
    if (!ID_RE.test(n.id) || byId.has(n.id)) { add('A step has a missing or repeated id. Delete it and add it again.', { nodeId: n.id }); continue }
    byId.set(n.id, n)
    checkNode(n, g, refs, (m) => add(m, { nodeId: n.id }))
  }
  const starts = g.nodes.filter((n) => n.type === 'start')
  if (starts.length !== 1) add(starts.length ? 'Keep only one Start step.' : 'Add a Start step.')

  const seen = new Set<string>()
  const pairs = new Set<string>()
  for (const e of g.edges) {
    const at = { edgeId: e.id }
    if (!ID_RE.test(e.id) || seen.has(e.id)) { add('A connection has a missing or repeated id. Delete it and connect again.', at); continue }
    seen.add(e.id)
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    if (!from || !to) { add('A connection points at a deleted step. Delete it.', at); continue }
    if (!outcomesOf(from).includes(e.outcome)) add(`"${nodeName(from)}" has no "${outcomeLabel(e.outcome)}" outcome. Delete this connection.`, at)
    if (to.type === 'start') add('Nothing can lead back to Start. Connect to another step.', at)
    const pair = `${e.from}\u0000${e.outcome}`
    if (pairs.has(pair)) add(`"${nodeName(from)}" has two paths for "${outcomeLabel(e.outcome)}". Keep one.`, at)
    pairs.add(pair)
    for (const a of e.actions) { const m = actionIssue(a, g, refs); if (m) add(m, at) }
  }
  for (const n of byId.values()) {
    for (const o of outcomesOf(n)) {
      if (!g.edges.some((e) => e.from === n.id && e.outcome === o && byId.has(e.to))) {
        add(`Connect the "${OUTCOME_LABELS[o]}" outcome of "${nodeName(n)}".`, { nodeId: n.id })
      }
    }
  }
  if (starts.length === 1) {
    const reached = reach(g, starts[0].id)
    for (const n of byId.values()) if (!reached.has(n.id)) add(`"${nodeName(n)}" cannot be reached from Start.`, { nodeId: n.id })
  }
  for (const id of stuckLoop(g, byId)) add('This loop has no Form or Time step, so it would never stop. Add one to the loop.', { nodeId: id })
  return issues
}

function checkNode(n: WfNode, g: Graph, refs: Refs, add: (m: string) => void) {
  const name = nodeName(n)
  switch (n.type) {
    case 'start':
    case 'form':
      if (!n.formId) add(`Choose a form for "${name}".`)
      else if (!refs.forms.has(n.formId)) add(`The form for "${name}" no longer exists. Choose another.`)
      if (n.type === 'start') return
      if (n.mode !== 'fill' && n.mode !== 'approve') add(`Choose whether "${name}" is filled in or approved.`)
      if (n.due !== undefined && durationMs(n.due) === null) add(`Enter a due time for "${name}" between 1 minute and 366 days.`)
      return checkAssignee(n, g, refs, add)
    case 'condition':
      if (!isObj(n.rule) || !parsePath(n.rule.field) || !(OPERATORS as readonly unknown[]).includes(n.rule.operator)) add(`Set the rule for "${name}".`)
      return
    case 'time': {
      const hasAfter = n.after !== undefined
      const hasRelative = n.relative !== undefined
      if (hasAfter === hasRelative) return add(`Choose either a wait time or a date field for "${name}".`)
      if (hasAfter && durationMs(n.after) === null) return add(`Enter a wait for "${name}" between 1 minute and 366 days.`)
      if (hasRelative && relativeMs(n.relative) === null) add(`Choose a date field, an amount and before or after for "${name}".`)
      return
    }
    case 'end':
      if (n.status !== 'done' && n.status !== 'rejected') add(`Choose whether "${name}" ends as done or rejected.`)
      return
    default:
      add('This step type is not supported. Delete it.')
  }
}

function checkAssignee(n: FormNode, g: Graph, refs: Refs, add: (m: string) => void) {
  const a: unknown = n.assignee
  const name = nodeName(n)
  if (isObj(a) && typeof a.role === 'string' && a.role) {
    if (!refs.roles.has(a.role)) add(`The role assigned to "${name}" no longer exists.`)
    return
  }
  if (isObj(a) && typeof a.user === 'string' && a.user) {
    if (!refs.users.has(a.user)) add(`The person assigned to "${name}" is no longer a member.`)
    return
  }
  if (isObj(a) && typeof a.step === 'string' && a.step) {
    const s = g.nodes.find((x) => x.id === a.step)
    if (!s || (s.type !== 'start' && s.type !== 'form') || s.id === n.id) add(`"${name}" must be assigned from an earlier Start or Form step.`)
    return
  }
  add(`Choose who completes "${name}".`)
}

function actionIssue(a: unknown, g: Graph, refs: Refs): string | null {
  if (!isObj(a)) return 'Remove the broken action from this connection.'
  if (a.type === 'set_status') {
    const label = typeof a.label === 'string' ? a.label.trim() : ''
    return label.length >= 1 && label.length <= 60 ? null : 'Enter the status text (up to 60 characters).'
  }
  if (a.type === 'send_message') {
    const steps = new Set(g.nodes.filter((n) => n.type === 'start' || n.type === 'form').map((n) => n.id))
    return sendMessageIssue(a, { templates: refs.templates, roles: refs.roles, users: refs.users, steps })
  }
  if (a.type === 'generate_pdf') return null
  return 'Remove the unknown action from this connection.'
}

function reach(g: Graph, from: string): Set<string> {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const id = queue.shift() as string
    for (const e of g.edges) if (e.from === id && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to) }
  }
  return seen
}

/** Steps on a cycle made only of Start / Condition / End steps: one advance would spin round it forever. */
function stuckLoop(g: Graph, byId: Map<string, WfNode>): Set<string> {
  const free = (id: string) => { const t = byId.get(id)?.type; return t !== undefined && t !== 'form' && t !== 'time' }
  const next = new Map<string, string[]>()
  for (const e of g.edges) if (free(e.from) && free(e.to)) next.set(e.from, [...(next.get(e.from) ?? []), e.to])
  const state = new Map<string, 1 | 2>() // 1 = on the stack, 2 = finished
  const stack: string[] = []
  const out = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    stack.push(id)
    for (const to of next.get(id) ?? []) {
      if (state.get(to) === 1) for (const x of stack.slice(stack.lastIndexOf(to))) out.add(x)
      else if (!state.has(to)) visit(to)
    }
    stack.pop()
    state.set(id, 2)
  }
  for (const id of next.keys()) if (!state.has(id)) visit(id)
  return out
}
