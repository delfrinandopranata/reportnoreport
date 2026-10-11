import { validateAnswers, validateSchema, type Answers, type Field } from '../_shared/forms/index.ts'

export type LoadedForm = { id: string; org_id: string; schema: unknown }
export type Deps = {
  userId(): Promise<string | null>
  /** Caller-scoped read: RLS returns the form only to active members of its org. */
  loadForm(id: string): Promise<LoadedForm | null>
  insert(row: { org_id: string; form_id: string; answers: Answers; submitted_by: string }): Promise<string>
  /** Service-level lookup: does this object exist in the form-files bucket? */
  fileExists(path: string): Promise<boolean>
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
  const missing = await missingUploads(form.schema as Field[], checked.answers, deps)
  if (Object.keys(missing).length) return { status: 400, body: { error: 'Some answers need fixing.', fieldErrors: missing } }
  const submissionId = await deps.insert({ org_id: form.org_id, form_id: form.id, answers: checked.answers, submitted_by: userId })
  return { status: 200, body: { submissionId, answers: checked.answers } }
}

/** Shape and prefix are already checked; this proves each referenced object was really uploaded. */
async function missingUploads(fields: Field[], answers: Answers, deps: Deps): Promise<Record<string, string>> {
  const jobs: Promise<[string, string] | null>[] = []
  const probe = (f: Field, v: unknown, key: string) => {
    if ((f.type !== 'file' && f.type !== 'signature') || typeof v !== 'string') return
    const msg = f.type === 'file' ? 'Upload the file again.' : 'Sign again.'
    jobs.push(deps.fileExists(v).then((ok) => (ok ? null : [key, msg])))
  }
  for (const f of fields) {
    const v = answers[f.key]
    if (f.type === 'group' && Array.isArray(v)) {
      v.forEach((row, i) => { for (const c of f.fields ?? []) if (isObj(row)) probe(c, row[c.key], `${f.key}.${i}.${c.key}`) })
    } else probe(f, v, f.key)
  }
  return Object.fromEntries((await Promise.all(jobs)).filter((x): x is [string, string] => !!x))
}
