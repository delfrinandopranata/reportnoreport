import { evaluate, readPath, type Answers } from '../forms/index.ts'
import type { Aggregate, Column, ReportDef } from './definition.ts'

export type ReportRecord = {
  id: string; title: string; status: string; label: string | null; current_node_id: string | null
  started_by: string; created_at: string; updated_at: string; data: Answers
}
export type Cell = string | number | null
export type RunCtx = { now: Date; stepName(nodeId: string): string; personName(userId: string): string }
export type Group = { key: Cell; count: number; sum: number | null; skipped: number }
type Page = { page: number; pageSize: number }
export type RowsResult = Page & { kind: 'rows'; rows: { id: string; cells: Cell[] }[]; total: number; totalRecords: number }
export type GroupsResult = Page & {
  kind: 'groups'; groups: Group[]; total: number; totalRecords: number; grandTotal: number | null; skipped: number
}
export type RunResult = RowsResult | GroupsResult

export const PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
// Same words as src/records/status.ts, so a report reads like the records list.
export const STATUS_WORDS: Record<string, string> = { open: 'In progress', done: 'Done', rejected: 'Rejected', error: 'Stopped' }

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
const round = (n: number) => Number(n.toFixed(10)) // 0.1 + 0.2 reads 0.3

function text(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    const parts = v.map(text).filter((t): t is string => t !== null)
    return parts.length ? parts.join(', ') : null
  }
  return null
}

/** One cell, as a report table, a CSV and a group key all show it. A lone number stays a number. */
export function cellOf(r: ReportRecord, c: Column, ctx: RunCtx): Cell {
  if ('meta' in c) {
    switch (c.meta) {
      case 'title': return r.title
      case 'status': return STATUS_WORDS[r.status] ?? r.status
      case 'label': return r.label
      case 'step': return r.current_node_id ? ctx.stepName(r.current_node_id) : null
      case 'started_by': return ctx.personName(r.started_by)
      case 'created_at': return r.created_at
      case 'updated_at': return r.updated_at
    }
  }
  const vals = readPath(r.data, c.field) ?? []
  if (vals.length === 1 && typeof vals[0] === 'number') return Number.isFinite(vals[0]) ? vals[0] : null
  const parts = vals.map(text).filter((t): t is string => t !== null)
  return parts.length ? parts.join(', ') : null
}

/** "3" and 3 display the same, so they are one group; "3.0" displays differently and stays its own. Sums still never coerce. */
const canonical = (k: Cell): Cell => (typeof k === 'string' && k !== '' && Number.isFinite(Number(k)) && String(Number(k)) === k ? Number(k) : k)

function byKey(a: Group, b: Group): number {
  if (a.key === null || b.key === null) return a.key === b.key ? 0 : a.key === null ? 1 : -1
  if (typeof a.key === 'number' && typeof b.key === 'number') return a.key - b.key
  return String(a.key).localeCompare(String(b.key), 'en-GB', { numeric: true })
}

function groupRecords(records: ReportRecord[], by: Column, agg: Aggregate, ctx: RunCtx): Group[] {
  const groups = new Map<string, Group>()
  for (const r of records) {
    const key = canonical(cellOf(r, by, ctx))
    const id = key === null ? '' : `${typeof key}:${key}`
    const g = groups.get(id) ?? { key, count: 0, sum: null, skipped: 0 }
    groups.set(id, g)
    g.count += 1
    if (agg.fn !== 'sum') continue
    for (const v of readPath(r.data, agg.field) ?? []) {
      if (typeof v === 'number' && Number.isFinite(v)) g.sum = (g.sum ?? 0) + v
      else if (!blank(v)) g.skipped += 1 // text, "4", true: left out and counted, never coerced
    }
  }
  return [...groups.values()].map((g) => ({ ...g, sum: g.sum === null ? null : round(g.sum) })).sort(byKey)
}

/**
 * Filters with the shared evaluator, then pages rows or groups. Totals are always the full counts.
 * `paging: null` returns everything (CSV export); a page is never more than MAX_PAGE_SIZE.
 */
export function runReport(records: ReportRecord[], def: ReportDef, ctx: RunCtx, paging: Page | null): RunResult {
  const size = paging ? Math.min(Math.max(Math.trunc(paging.pageSize) || PAGE_SIZE, 1), MAX_PAGE_SIZE) : Infinity
  const page = paging ? Math.max(Math.trunc(paging.page) || 1, 1) : 1
  const from = (page - 1) * size || 0
  const matched = records.filter((r) => def.filters.every((f) => evaluate(f, r.data, ctx.now)))
  if (!def.groupBy || !def.aggregate) {
    const rows = matched.slice(from, from + size).map((r) => ({ id: r.id, cells: def.columns.map((c) => cellOf(r, c, ctx)) }))
    return { kind: 'rows', rows, total: matched.length, totalRecords: matched.length, page, pageSize: paging ? size : matched.length }
  }
  const all = groupRecords(matched, def.groupBy, def.aggregate, ctx)
  const sums = all.filter((g) => g.sum !== null)
  const grandTotal = def.aggregate.fn === 'count' ? matched.length : sums.length ? round(sums.reduce((n, g) => n + (g.sum as number), 0)) : null
  return {
    kind: 'groups', groups: all.slice(from, from + size), total: all.length, totalRecords: matched.length,
    grandTotal, skipped: all.reduce((n, g) => n + g.skipped, 0), page, pageSize: paging ? size : all.length,
  }
}
