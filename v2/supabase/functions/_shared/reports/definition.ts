import { KEY_RE, OPERATORS, parsePath, type Rule } from '../forms/index.ts'
import { ID_RE } from '../workflow/graph.ts'

export const META_KEYS = ['title', 'status', 'label', 'step', 'started_by', 'created_at', 'updated_at'] as const
export type MetaKey = (typeof META_KEYS)[number]
export const META_LABELS: Record<MetaKey, string> = {
  title: 'Title', status: 'Status', label: 'Status label', step: 'Current step',
  started_by: 'Started by', created_at: 'Started', updated_at: 'Last updated',
}
export type Column = { meta: MetaKey } | { field: string }
export type Aggregate = { fn: 'count' } | { fn: 'sum'; field: string }
export type ReportDef = { columns: Column[]; filters: Rule[]; groupBy: Column | null; aggregate: Aggregate | null }
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }
export type ReportTemplate = { header: string; fields: { nodeId: string; key: string }[]; signoff: string[] }

export const MAX_COLUMNS = 20
export const MAX_FILTERS = 10

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (error: string): Parsed<never> => ({ ok: false, error })

export function readColumn(v: unknown): Column | null {
  if (!isObj(v)) return null
  if (typeof v.meta === 'string' && (META_KEYS as readonly string[]).includes(v.meta)) return { meta: v.meta as MetaKey }
  if (typeof v.field === 'string' && parsePath(v.field)) return { field: v.field }
  return null
}

export const columnId = (c: Column) => ('meta' in c ? `meta:${c.meta}` : `field:${c.field}`)

function readAggregate(v: unknown): Aggregate | null {
  if (!isObj(v)) return null
  if (v.fn === 'count') return { fn: 'count' }
  if (v.fn === 'sum' && typeof v.field === 'string' && parsePath(v.field)) return { fn: 'sum', field: v.field }
  return null
}

/** Validates a saved_reports row (as stored) or a builder draft. Every message is shown to the person as it is. */
export function readReportDef(raw: { columns?: unknown; filters?: unknown; group_by?: unknown; aggregate?: unknown }): Parsed<ReportDef> {
  const cols = Array.isArray(raw.columns) ? raw.columns.map(readColumn) : []
  if (!cols.length) return fail('Choose at least one column.')
  if (cols.length > MAX_COLUMNS) return fail(`Use at most ${MAX_COLUMNS} columns.`)
  if (cols.some((c) => !c)) return fail('A column points at something that does not exist. Remove it and choose again.')
  const filters: unknown[] | null = raw.filters == null ? [] : Array.isArray(raw.filters) ? raw.filters : null
  if (!filters || filters.some((f) => !isObj(f) || !parsePath(f.field) || !(OPERATORS as readonly unknown[]).includes(f.operator))) {
    return fail('Every filter needs a field and a condition.')
  }
  if (filters.length > MAX_FILTERS) return fail(`Use at most ${MAX_FILTERS} filters.`)
  const groupBy = raw.group_by == null ? null : readColumn(raw.group_by)
  if (raw.group_by != null && !groupBy) return fail('Choose what to group by again.')
  const aggregate = raw.aggregate == null ? null : readAggregate(raw.aggregate)
  if (raw.aggregate != null && !aggregate) return fail('Choose a number field to add up.')
  if (groupBy && !aggregate) return fail('Choose whether to count records or add up a number for each group.')
  if (!groupBy && aggregate) return fail('Choose a column to group by, or remove the total.')
  return { ok: true, value: { columns: cols as Column[], filters: filters as Rule[], groupBy, aggregate } }
}

/** A report_templates row, or null when any part is malformed (render-pdfs then fails the job with a sentence). */
export function readTemplate(raw: { header?: unknown; fields?: unknown; signoff?: unknown }): ReportTemplate | null {
  const header = typeof raw.header === 'string' ? raw.header : ''
  if (header.length > 2000 || !Array.isArray(raw.fields) || !Array.isArray(raw.signoff)) return null
  if (raw.fields.length > 100 || raw.signoff.length > 20) return null
  const fields = raw.fields.map((f) => (isObj(f) && typeof f.nodeId === 'string' && ID_RE.test(f.nodeId) && typeof f.key === 'string' && KEY_RE.test(f.key)
    ? { nodeId: f.nodeId, key: f.key } : null))
  const signoff = raw.signoff.map((s) => (typeof s === 'string' && ID_RE.test(s) ? s : null))
  if (fields.some((f) => !f) || signoff.some((s) => !s)) return null
  return { header, fields: fields as ReportTemplate['fields'], signoff: signoff as string[] }
}
