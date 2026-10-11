import type { Field } from '../_shared/forms/index.ts'
import { nodeById, nodeName, readGraph } from '../_shared/workflow/graph.ts'
import {
  MAX_PAGE_SIZE, PAGE_SIZE, aggregateLabel, columnLabel, csvFilename, dataColumns, readReportDef, runReport, stepFields, toCsv,
  type Cell, type ReportRecord,
} from '../_shared/reports/index.ts'
import type { Result } from '../advance/engine.ts'

export type SavedRow = { name: string; workflow_id: string; columns: unknown; filters: unknown; group_by: unknown; aggregate: unknown }
/** Every method reads as the caller: RLS decides which rows exist. */
export interface ReportSource {
  permissions(orgId: string): Promise<ReadonlySet<string>>
  savedReport(id: string, orgId: string): Promise<SavedRow | null>
  workflow(id: string, orgId: string): Promise<{ name: string; graph: unknown } | null>
  forms(orgId: string, ids: string[]): Promise<Map<string, Field[]>>
  names(orgId: string): Promise<Map<string, string>>
  records(orgId: string, workflowId: string): AsyncIterable<ReportRecord[]>
}
export type Deps = { userId(): Promise<string | null>; source: ReportSource; now(): Date }
export type Csv = { status: 200; csv: string; filename: string }

// shortcut: a report reads at most 10,000 visible records and filters them in TypeScript (spec §4.3's one evaluator);
// push filters into SQL when an org's workflow outgrows it.
export const MAX_SCAN = 10_000
const TOO_MANY = 'This workflow has more than 10,000 records you can see, which is more than one report can read. Ask an admin to split the work into separate workflows.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const intIn = (v: unknown, fallback: number, max: number) => (v === undefined ? fallback : Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? v as number : null)
const keyText = (k: Cell) => (k === null ? 'No answer' : k)

type Req = { orgId: string; reportId: string | null; workflowId: string | null; definition: unknown; page: number; pageSize: number; format: 'json' | 'csv' }

function parse(b: unknown): Req | null {
  if (!isObj(b) || !isUuid(b.orgId)) return null
  const format = b.format === undefined || b.format === 'json' ? 'json' : b.format === 'csv' ? 'csv' : null
  const page = intIn(b.page, 1, 100_000)
  const pageSize = intIn(b.pageSize, PAGE_SIZE, MAX_PAGE_SIZE)
  if (!format || page === null || pageSize === null) return null
  if (isUuid(b.reportId)) return { orgId: b.orgId, reportId: b.reportId, workflowId: null, definition: null, page, pageSize, format }
  if (isUuid(b.workflowId) && isObj(b.definition)) return { orgId: b.orgId, reportId: null, workflowId: b.workflowId, definition: b.definition, page, pageSize, format }
  return null
}

/** Runs a saved report or a builder draft over the records the caller can see. */
export async function runReportRequest(body: unknown, deps: Deps): Promise<Result | Csv> {
  const req = parse(body)
  if (!req) return { status: 400, body: { error: 'Send a report to run.' } }
  if (!(await deps.userId())) return { status: 401, body: { error: 'Sign in again to continue.' } }
  const perms = await deps.source.permissions(req.orgId)
  if (!perms.has('reports.view') && !perms.has('reports.manage')) return { status: 403, body: { error: 'Not allowed.' } }

  let name = 'Report'
  let workflowId = req.workflowId as string
  let raw = req.definition as SavedRow
  if (req.reportId) {
    const saved = await deps.source.savedReport(req.reportId, req.orgId)
    if (!saved) return { status: 404, body: { error: 'This report does not exist.' } }
    ;({ name, workflow_id: workflowId } = saved)
    raw = saved
  }
  const parsed = readReportDef(raw)
  if (!parsed.ok) return req.reportId ? { status: 409, body: { error: `This report needs fixing: ${parsed.error}` } } : { status: 400, body: { error: parsed.error } }
  const def = parsed.value
  const wf = await deps.source.workflow(workflowId, req.orgId)
  if (!wf) return { status: 404, body: { error: "This report's workflow does not exist." } }

  const graph = readGraph(wf.graph) ?? { nodes: [], edges: [] }
  const formIds = [...new Set(graph.nodes.flatMap((n) => (n.type === 'start' || n.type === 'form' ? [n.formId] : [])))]
  const [forms, names] = await Promise.all([deps.source.forms(req.orgId, formIds), deps.source.names(req.orgId)])
  const records: ReportRecord[] = []
  for await (const page of deps.source.records(req.orgId, workflowId)) {
    records.push(...page)
    if (records.length > MAX_SCAN) return { status: 413, body: { error: TOO_MANY } }
  }
  records.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) // newest first, stable

  const cols = dataColumns(stepFields(graph, forms))
  const ctx = { now: deps.now(), stepName: (id: string) => nodeName(nodeById(graph, id)), personName: (id: string) => names.get(id) ?? 'Former member' }
  const columns = def.columns.map((c) => columnLabel(c, cols))
  const groupLabel = def.groupBy ? columnLabel(def.groupBy, cols) : null
  const aggLabel = def.aggregate ? aggregateLabel(def.aggregate, cols) : null

  if (req.format === 'csv') {
    const all = runReport(records, def, ctx, null)
    const day = ctx.now.toISOString().slice(0, 10)
    const csv = all.kind === 'rows'
      ? toCsv(columns, all.rows.map((r) => r.cells))
      : def.aggregate?.fn === 'sum'
        ? toCsv([groupLabel!, aggLabel!, 'Records', 'Values left out'], all.groups.map((g) => [keyText(g.key), g.sum, g.count, g.skipped]))
        : toCsv([groupLabel!, aggLabel!], all.groups.map((g) => [keyText(g.key), g.count]))
    return { status: 200, csv, filename: csvFilename(name, day) }
  }
  const result = runReport(records, def, ctx, { page: req.page, pageSize: req.pageSize })
  return { status: 200, body: { name, workflowName: wf.name, columns, groupLabel, aggregateLabel: aggLabel, aggregateFn: def.aggregate?.fn ?? null, result } }
}
