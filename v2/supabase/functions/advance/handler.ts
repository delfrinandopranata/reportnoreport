import type { Answers } from '../_shared/forms/index.ts'
import { OUTCOMES, type Outcome } from '../_shared/workflow/graph.ts'
import { startRecord, submitTask, type Result, type Store } from './engine.ts'

export type Deps = { userId(): Promise<string | null>; store: Store; fileExists(path: string): Promise<boolean>; now(): Date; appUrl: string }
type Req = { action: 'start'; workflowId: string; answers: Answers } | { action: 'submit'; taskId: string; outcome: Outcome; answers: Answers }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

function parse(b: unknown): Req | null {
  if (!isObj(b) || !isObj(b.answers)) return null
  if (b.action === 'start' && isUuid(b.workflowId)) return { action: 'start', workflowId: b.workflowId, answers: b.answers }
  if (b.action === 'submit' && isUuid(b.taskId) && (OUTCOMES as readonly unknown[]).includes(b.outcome)) {
    return { action: 'submit', taskId: b.taskId, outcome: b.outcome as Outcome, answers: b.answers }
  }
  return null
}

/** The authority for every workflow move a person makes; the browser only sends answers and an outcome. */
export async function advance(body: unknown, deps: Deps): Promise<Result> {
  const req = parse(body)
  if (!req) return { status: 400, body: { error: 'Send a start or submit request.' } }
  const actor = await deps.userId()
  if (!actor) return { status: 401, body: { error: 'Sign in again to continue.' } }
  const ctx = { now: deps.now(), actor, appUrl: deps.appUrl, fileExists: deps.fileExists }
  return deps.store.tx((tx) => (req.action === 'start' ? startRecord(tx, req, ctx) : submitTask(tx, req, ctx)))
}
