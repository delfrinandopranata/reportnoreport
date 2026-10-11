import { validateAnswers, validateSchema, type Answers, type Field } from '../_shared/forms/index.ts'

export type LoadedForm = { id: string; org_id: string; schema: unknown }
export type Deps = {
  userId(): Promise<string | null>
  /** Caller-scoped read: RLS returns the form only to active members of its org. */
  loadForm(id: string): Promise<LoadedForm | null>
  insert(row: { org_id: string; form_id: string; answers: Answers; submitted_by: string }): Promise<string>
  now(): Date
}
export type Result = { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The authority for a submission: the browser's validation and calculated values are only hints. */
export async function submitForm(body: unknown, deps: Deps): Promise<Result> {
  if (!isObj(body) || typeof body.formId !== 'string' || !UUID.test(body.formId) || !isObj(body.answers)) {
    return { status: 400, body: { error: 'Send a form id and an answers object.' } }
  }
  const userId = await deps.userId()
  if (!userId) return { status: 401, body: { error: 'Sign in again to submit this form.' } }
  const form = await deps.loadForm(body.formId)
  if (!form) return { status: 404, body: { error: 'This form does not exist or you do not have access to it.' } }
  if (validateSchema(form.schema).length) {
    return { status: 409, body: { error: 'This form has a setup problem. Ask a form manager to fix it.' } }
  }
  const checked = validateAnswers(form.schema as Field[], body.answers, { now: deps.now(), filePrefix: `${form.org_id}/${userId}/` })
  if (!checked.ok) return { status: 400, body: { error: 'Some answers need fixing.', fieldErrors: checked.errors } }
  const submissionId = await deps.insert({ org_id: form.org_id, form_id: form.id, answers: checked.answers, submitted_by: userId })
  return { status: 200, body: { submissionId, answers: checked.answers } }
}
