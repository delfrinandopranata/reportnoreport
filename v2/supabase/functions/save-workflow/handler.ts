import { checkGraph, readGraph, type Refs } from '../_shared/workflow/graph.ts'

export type Loaded = { id: string; org_id: string; status: 'draft' | 'published' }
export type SaveOutcome =
  | { ok: true; updatedAt: string; status: 'draft' | 'published' }
  | { ok: false; conflict: true }
  | { ok: false; openOn: string }
export type Deps = {
  userId(): Promise<string | null>
  /** Caller-scoped read: RLS returns drafts only to workflows.manage holders of that org. */
  loadWorkflow(id: string): Promise<Loaded | null>
  can(orgId: string, perm: 'workflows.manage' | 'workflows.publish'): Promise<boolean>
  /** Ids that a graph in this org may reference: forms, roles, active members. */
  refs(orgId: string): Promise<Refs>
  /** Conditional on updated_at; the database guard refuses deleting a step with open records. */
  save(row: { id: string; name: string; graph: unknown; status: 'draft' | 'published'; updated_by: string; expected: string }): Promise<SaveOutcome>
}
export type Result = { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const out = (status: number, body: Record<string, unknown>): Result => ({ status, body })

/** The only writer of a workflow's name, graph and status, so a published graph always passes the check. */
export async function saveWorkflow(body: unknown, deps: Deps): Promise<Result> {
  if (!isObj(body) || typeof body.workflowId !== 'string' || !UUID.test(body.workflowId) || typeof body.name !== 'string' ||
      typeof body.updatedAt !== 'string' || (body.publish !== undefined && typeof body.publish !== 'boolean') || !readGraph(body.graph)) {
    return out(400, { error: 'Send the workflow id, name, steps and version.' })
  }
  const name = body.name.trim()
  if (name.length < 1 || name.length > 120) return out(400, { error: 'Enter a name of up to 120 characters.' })
  const userId = await deps.userId()
  if (!userId) return out(401, { error: 'Sign in again to save this workflow.' })
  const wf = await deps.loadWorkflow(body.workflowId)
  if (!wf) return out(404, { error: 'This workflow does not exist or you do not have access to it.' })
  if (!(await deps.can(wf.org_id, 'workflows.manage'))) return out(403, { error: 'You do not have permission to do that.' })
  const publishing = body.publish === true && wf.status === 'draft'
  if (publishing && !(await deps.can(wf.org_id, 'workflows.publish'))) return out(403, { error: 'You need permission to publish workflows.' })
  const status = publishing || wf.status === 'published' ? 'published' : 'draft'

  const issues = checkGraph(body.graph, await deps.refs(wf.org_id))
  if (status === 'published' && issues.length) {
    return out(409, {
      error: publishing ? 'Fix the issues on the canvas before publishing.' : 'This workflow is published, so it must stay valid. Fix the issues on the canvas, then save.',
      issues,
    })
  }
  const saved = await deps.save({ id: wf.id, name, graph: body.graph, status, updated_by: userId, expected: body.updatedAt })
  if (saved.ok) return out(200, { updatedAt: saved.updatedAt, status: saved.status, issues })
  if ('conflict' in saved) return out(409, { error: 'This workflow was changed by someone else. Reload to see their changes.', conflict: true })
  return out(409, { error: 'A step with open records cannot be deleted. Put it back, or wait until those records move on.', nodeId: saved.openOn })
}
