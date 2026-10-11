import { resolve, toDay, type Answers, type Field } from '../forms/index.ts'
import { readGraph } from '../workflow/graph.ts'
import { stepFields, type StepFields } from './catalogue.ts'
import type { ReportTemplate } from './definition.ts'
import { STATUS_WORDS } from './run.ts'

/** A PDF that retrying cannot fix. The message is shown to people as it is. */
export class PdfProblem extends Error {}

export type PdfSubmission = { node_id: string; answers: Answers; submitted_by: string; outcome: 'submitted' | 'approved' | 'rejected'; created_at: string }
export type PdfSource = {
  orgId: string; orgName: string; workflowName: string; graph: unknown
  record: { id: string; title: string; status: string; started_by: string; created_at: string }
  template: ReportTemplate
  forms: Record<string, Field[]> // by form id
  submissions: PdfSubmission[] // oldest first
  names: Record<string, string> // user id → display name
}
export type PdfItem =
  | { kind: 'text'; label: string; text: string }
  | { kind: 'signature'; label: string; path: string }
  | { kind: 'rows'; label: string; rows: string[] }
export type PdfModel = {
  org: string; title: string; header: string; meta: string[]
  sections: { nodeId: string; step: string; items: PdfItem[] }[]
  signoffs: { step: string; line: string; signature: string | null }[]
  generated: string
}

// shortcut: times print in UTC; add an org time-zone setting when an org outside UTC+0 asks for local times on PDFs.
const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const NUM = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 10 })
const OUTCOMES = { submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' } as const

export const formatWhen = (iso: string) => `${WHEN.format(new Date(iso))} UTC`
const fileLabel = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '')
const unanswered = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function answerText(f: Field, v: unknown): string {
  if (unanswered(v)) return 'Not answered'
  switch (f.type) {
    case 'checkbox': return v === true ? 'Yes' : 'No'
    case 'date': { const d = toDay(v); return d === null ? String(v) : DAY.format(new Date(d * 86_400_000)) }
    case 'number': case 'calculated': return typeof v === 'number' && Number.isFinite(v) ? NUM.format(v) : 'Not answered'
    case 'multi_select': return Array.isArray(v) ? v.map(String).join(', ') : String(v)
    case 'file': return typeof v === 'string' ? fileLabel(v) : 'Not answered'
    case 'signature': return 'Signed'
    default: return String(v)
  }
}

function inOrg(path: string, orgId: string, step: string): string {
  if (!path.startsWith(`${orgId}/`)) throw new PdfProblem(`A signature on "${step}" is not stored with this organisation, so the PDF was not made.`)
  return path
}

function itemFor(step: StepFields, key: string, sub: PdfSubmission | undefined, orgId: string): PdfItem | null {
  const f = step.fields.find((x) => x.key === key)
  if (!f) return { kind: 'text', label: key, text: 'This question is no longer on the form.' }
  if (!sub) return { kind: 'text', label: f.label, text: 'Not submitted yet' }
  // Judged as it was when submitted, so a within_days rule gives the same answer it gave then.
  if (resolve(step.fields, sub.answers, new Date(sub.created_at)).hidden.has(key)) return null
  const v = sub.answers[key]
  if (f.type === 'signature' && typeof v === 'string' && v) return { kind: 'signature', label: f.label, path: inOrg(v, orgId, step.step) }
  if (f.type === 'group') {
    if (!Array.isArray(v) || !v.length) return { kind: 'text', label: f.label, text: 'Not answered' }
    const rows = v.map((row, i) => `${i + 1}. ${(f.fields ?? []).map((c) =>
      `${c.label}: ${answerText(c, row && typeof row === 'object' ? (row as Answers)[c.key] : undefined)}`).join(' · ')}`)
    return { kind: 'rows', label: f.label, rows }
  }
  return { kind: 'text', label: f.label, text: answerText(f, v) }
}

/** What the PDF says, from each step's latest submission. Pure: render-pdfs lays it out and draws it. */
export function buildPdfModel(src: PdfSource, now: Date): PdfModel {
  const graph = readGraph(src.graph)
  if (!graph) throw new PdfProblem('This workflow could not be read, so the PDF was not made. Ask a workflow manager to open and save it.')
  const steps = stepFields(graph, new Map(Object.entries(src.forms)))
  const latest = new Map<string, PdfSubmission>()
  for (const s of src.submissions) latest.set(s.node_id, s) // oldest first, so the last one wins
  const name = (id: string) => src.names[id] ?? 'Former member'
  const sections: PdfModel['sections'] = []
  for (const ref of src.template.fields) {
    const step = steps.find((s) => s.nodeId === ref.nodeId) ?? { nodeId: ref.nodeId, step: 'A deleted step', fields: [] }
    let section = sections.at(-1)
    if (!section || section.nodeId !== ref.nodeId) { section = { nodeId: ref.nodeId, step: step.step, items: [] }; sections.push(section) }
    const item = itemFor(step, ref.key, latest.get(ref.nodeId), src.orgId)
    if (item) section.items.push(item)
  }
  const signoffs = src.template.signoff.map((nodeId) => {
    const step = steps.find((s) => s.nodeId === nodeId)
    const sub = latest.get(nodeId)
    const label = step?.step ?? 'A deleted step'
    if (!step || !sub) return { step: label, line: 'Not done yet', signature: null }
    const hidden = resolve(step.fields, sub.answers, new Date(sub.created_at)).hidden
    const sig = step.fields.find((f) => f.type === 'signature' && !hidden.has(f.key) && typeof sub.answers[f.key] === 'string' && sub.answers[f.key])
    return {
      step: label,
      line: `${OUTCOMES[sub.outcome]} by ${name(sub.submitted_by)} · ${formatWhen(sub.created_at)}`,
      signature: sig ? inOrg(sub.answers[sig.key] as string, src.orgId, label) : null,
    }
  })
  return {
    org: src.orgName,
    title: src.record.title,
    header: src.template.header,
    meta: [
      `Workflow: ${src.workflowName}`,
      `Status: ${STATUS_WORDS[src.record.status] ?? src.record.status}`,
      `Started ${formatWhen(src.record.created_at)} by ${name(src.record.started_by)}`,
    ],
    sections: sections.filter((s) => s.items.length),
    signoffs,
    generated: `Generated ${formatWhen(now.toISOString())}`,
  }
}
