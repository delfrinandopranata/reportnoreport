import type { ReportTemplate, StepFields } from './logic'

type Ref = ReportTemplate['fields'][number]

/** Answers sit in workflow order, then in the chosen order inside their step; sign-off follows the workflow too. Unknown steps go last. */
export function normaliseTemplate(t: ReportTemplate, steps: StepFields[]): ReportTemplate {
  const index = (id: string) => { const i = steps.findIndex((s) => s.nodeId === id); return i < 0 ? steps.length : i }
  const fields = t.fields.map((f, i) => ({ f, i })).sort((a, b) => index(a.f.nodeId) - index(b.f.nodeId) || a.i - b.i).map((x) => x.f)
  const signoff = t.signoff.map((id, i) => ({ id, i })).sort((a, b) => index(a.id) - index(b.id) || a.i - b.i).map((x) => x.id)
  return { ...t, fields, signoff }
}

export const hasAnswer = (t: ReportTemplate, nodeId: string, key: string) => t.fields.some((f) => f.nodeId === nodeId && f.key === key)

export function toggleAnswer(t: ReportTemplate, steps: StepFields[], ref: Ref, on: boolean): ReportTemplate {
  const without = t.fields.filter((f) => !(f.nodeId === ref.nodeId && f.key === ref.key))
  return normaliseTemplate({ ...t, fields: on ? [...without, ref] : without }, steps)
}

export function toggleSignoff(t: ReportTemplate, steps: StepFields[], nodeId: string, on: boolean): ReportTemplate {
  const without = t.signoff.filter((x) => x !== nodeId)
  return normaliseTemplate({ ...t, signoff: on ? [...without, nodeId] : without }, steps)
}

/** Moves an answer one place inside its own step. Returns null at the end of the step. */
export function moveAnswer(t: ReportTemplate, nodeId: string, key: string, by: -1 | 1): { t: ReportTemplate; position: number; total: number } | null {
  const mine = t.fields.filter((f) => f.nodeId === nodeId)
  const i = mine.findIndex((f) => f.key === key)
  const j = i + by
  if (i < 0 || j < 0 || j >= mine.length) return null
  const moved = [...mine]
  ;[moved[i], moved[j]] = [moved[j], moved[i]]
  let n = 0
  return { t: { ...t, fields: t.fields.map((f) => (f.nodeId === nodeId ? moved[n++] : f)) }, position: j + 1, total: mine.length }
}
