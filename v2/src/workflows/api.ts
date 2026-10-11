import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import type { Answers, Field } from '../forms/logic'
import type { SubmitResult } from '../forms/api'
import { readGraph, type Graph, type Issue, type Outcome } from './logic'

export type WorkflowStatus = 'draft' | 'published'
export type WorkflowRow = { id: string; name: string; status: WorkflowStatus; updated_at: string }
export type LoadedWorkflow = WorkflowRow & { org_id: string; graph: Graph }
export const RECORD_LIMIT = 200 // shortcut: newest 200 only; paging arrives with aggregate reports (Phase 5)

const graphOf = (raw: unknown): Graph => readGraph(raw) ?? { nodes: [], edges: [] }

export const useWorkflows = (orgId: string | null) => useQuery({
  queryKey: ['workflows', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('workflows').select('id, name, status, updated_at').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as WorkflowRow[]
  },
})

export const useWorkflow = (id: string) => useQuery({
  queryKey: ['workflow', id],
  enabled: !!id,
  queryFn: async () => {
    const { data, error } = await supabase.from('workflows').select('id, org_id, name, status, graph, updated_at').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? ({ ...data, graph: graphOf(data.graph) } as LoadedWorkflow) : null
  },
})

export type RoleRow = { id: string; name: string; is_owner: boolean }
/** Same key and select as the Members page, so the two share one cache entry (QA-2). */
export const useRoles = (orgId: string | null) => useQuery({
  queryKey: ['roles', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as RoleRow[]
  },
})

/** Open records per step, for the delete guard (workflows.manage only). */
export const useOpenCounts = (id: string) => useQuery({
  queryKey: ['open-counts', id],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('open_record_counts', { p_workflow: id })
    if (error) throw error
    return new Map((data ?? []).map((r: { node_id: string; n: number }) => [r.node_id, r.n]))
  },
})

export type Startable = { id: string; name: string }
export const useStartable = (orgId: string | null) => useQuery({
  queryKey: ['startable', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('workflows').select('id, name, can_start').eq('org_id', orgId!).eq('can_start', true).order('name')
    if (error) throw error
    return data as unknown as Startable[]
  },
})

type WorkflowRef = { name: string; graph: Graph }
const withGraph = <T extends { workflow: { name: string; graph: unknown } }>(row: T) => ({ ...row, workflow: { ...row.workflow, graph: graphOf(row.workflow.graph) } })

export type RecordStatus = 'open' | 'done' | 'rejected' | 'error'

export type MyTask = {
  id: string; node_id: string; due_at: string | null; claimed_by: string | null; assignee_role_id: string | null
  assignee_user_id: string | null; created_at: string; record: { id: string; title: string; workflow: WorkflowRef }
}
export const useMyTasks = (orgId: string | null) => useQuery({
  queryKey: ['my-tasks', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('tasks')
      .select('id, node_id, due_at, claimed_by, assignee_role_id, assignee_user_id, created_at, record:records(id, title, workflow:workflows(name, graph))')
      .eq('org_id', orgId!).eq('is_mine', true).order('created_at')
    if (error) throw error
    return (data as unknown as MyTask[]).map((t) => ({ ...t, record: withGraph(t.record) }))
  },
})

export type TaskDetail = {
  id: string; org_id: string; record_id: string; node_id: string; status: 'open' | 'done' | 'cancelled'; due_at: string | null
  claimed_by: string | null; assignee_role_id: string | null; assignee_user_id: string | null; is_mine: boolean
  record: { id: string; title: string; status: RecordStatus; error: string | null; workflow: WorkflowRef }
}
export const useTask = (id: string) => useQuery({
  queryKey: ['task', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('tasks')
      .select('id, org_id, record_id, node_id, status, due_at, claimed_by, assignee_role_id, assignee_user_id, is_mine, record:records(id, title, status, error, workflow:workflows(name, graph))')
      .eq('id', id).maybeSingle()
    if (error) throw error
    const t = data as unknown as TaskDetail | null
    return t ? { ...t, record: withGraph(t.record) } : null
  },
})

export type RecordFilter = 'all' | 'open' | 'error' | 'closed'
export type RecordRow = {
  id: string; org_id: string; title: string; status: RecordStatus; label: string | null; error: string | null
  current_node_id: string | null; started_by: string; created_at: string; workflow_id: string; workflow: WorkflowRef
}
const RECORD_COLS = 'id, org_id, title, status, label, error, current_node_id, started_by, created_at, workflow_id, workflow:workflows(name, graph)'

export const useRecords = (orgId: string | null, filter: RecordFilter) => useQuery({
  queryKey: ['records', orgId, filter],
  enabled: !!orgId,
  placeholderData: keepPreviousData, // the old list stays up while a new filter loads
  queryFn: async () => {
    let q = supabase.from('records').select(RECORD_COLS).eq('org_id', orgId!)
    if (filter === 'open' || filter === 'error') q = q.eq('status', filter)
    if (filter === 'closed') q = q.in('status', ['done', 'rejected'])
    const { data, error } = await q.order('created_at', { ascending: false }).limit(RECORD_LIMIT)
    if (error) throw error
    return (data as unknown as RecordRow[]).map(withGraph)
  },
})

export const useRecord = (id: string) => useQuery({
  queryKey: ['record', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('records').select(RECORD_COLS).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? withGraph(data as unknown as RecordRow) : null
  },
})

export type RecordEvent = { id: number; kind: string; node_id: string | null; actor_id: string | null; detail: Record<string, unknown>; created_at: string }
export const useRecordEvents = (recordId: string) => useQuery({
  queryKey: ['record-events', recordId],
  queryFn: async () => {
    const { data, error } = await supabase.from('record_events').select('id, kind, node_id, actor_id, detail, created_at').eq('record_id', recordId).order('id')
    if (error) throw error
    return data as RecordEvent[]
  },
})

export type RecordSubmission = {
  id: string; node_id: string; answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'
  created_at: string; form: { name: string; schema: Field[] } | null
}
export const useRecordSubmissions = (recordId: string) => useQuery({
  queryKey: ['record-submissions', recordId],
  queryFn: async () => {
    const { data, error } = await supabase.from('form_submissions')
      .select('id, node_id, answers, submitted_by, outcome, created_at, form:forms(name, schema)').eq('record_id', recordId).order('created_at')
    if (error) throw error
    return data as unknown as RecordSubmission[]
  },
})

type Reply = { ok: true; data: Record<string, unknown> } | { ok: false; body: Record<string, unknown>; status?: number }
/** The Edge Functions write their own user-facing sentences; anything else falls back to `fallback`. */
async function call(fn: string, body: Record<string, unknown>, fallback: string): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (!error) return { ok: true, data }
  if (error instanceof FunctionsHttpError) {
    const b = await error.context.json().catch(() => null)
    if (typeof b?.error === 'string') return { ok: false, body: b, status: error.context.status }
  }
  return { ok: false, body: { error: fallback } }
}

export type SaveResult =
  | { ok: true; updatedAt: string; status: WorkflowStatus }
  | { ok: false; error: string; conflict?: boolean; nodeId?: string; issues?: Issue[] }
export async function saveWorkflow(input: { workflowId: string; name: string; graph: Graph; updatedAt: string; publish: boolean }): Promise<SaveResult> {
  const r = await call('save-workflow', { ...input }, 'This workflow was not saved. Try again.')
  if (r.ok) return { ok: true, updatedAt: r.data.updatedAt as string, status: r.data.status as WorkflowStatus }
  return { ok: false, ...(r.body as { error: string; conflict?: boolean; nodeId?: string; issues?: Issue[] }) }
}

export type AdvanceBody =
  | { action: 'start'; workflowId: string; answers: Answers }
  | { action: 'submit'; taskId: string; outcome: Outcome; answers: Answers }
/** Same shape FormRunner expects; `id` is the record id and `status` says where the record ended up. */
export async function advance(body: AdvanceBody): Promise<SubmitResult> {
  const r = await call('advance', { ...body }, 'This step was not saved. Try again.')
  if (r.ok) return { ok: true, id: r.data.recordId as string, status: r.data.status as RecordStatus, recordError: (r.data.error as string | null) ?? null }
  return { ok: false, error: r.body.error as string, fieldErrors: r.body.fieldErrors as Record<string, string> | undefined, terminal: r.status === 403 || r.status === 404 || r.status === 409 }
}

export async function claimTask(id: string): Promise<void> {
  const { error } = await supabase.rpc('claim_task', { p_task: id })
  if (error) throw error
}
