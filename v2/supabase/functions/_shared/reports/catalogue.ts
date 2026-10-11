import type { Field, FieldType } from '../forms/index.ts'
import { nodeName, type Graph } from '../workflow/graph.ts'
import { META_LABELS, type Aggregate, type Column } from './definition.ts'

export type StepFields = { nodeId: string; step: string; fields: Field[] }
export type DataColumn = { path: string; label: string; type: FieldType }

/** The answerable fields of each Start/Form step in graph order; page breaks never hold an answer. */
export function stepFields(graph: Graph, forms: ReadonlyMap<string, Field[]>): StepFields[] {
  return graph.nodes.flatMap((n) => (n.type === 'start' || n.type === 'form'
    ? [{ nodeId: n.id, step: nodeName(n), fields: (forms.get(n.formId) ?? []).filter((f) => f.type !== 'page_break') }]
    : []))
}

/** Column choices over records.data. The first step wins a key, as it does when answers merge into the record. */
export function dataColumns(steps: StepFields[]): DataColumn[] {
  const out: DataColumn[] = []
  const seen = new Set<string>()
  const add = (path: string, label: string, type: FieldType) => {
    if (!seen.has(path)) { seen.add(path); out.push({ path, label, type }) }
  }
  for (const s of steps) {
    for (const f of s.fields) {
      if (f.type !== 'group') { add(f.key, f.label, f.type); continue }
      add(`${f.key}.count`, `${f.label}: number of rows`, 'number')
      for (const c of f.fields ?? []) add(`${f.key}[].${c.key}`, `${f.label}: ${c.label}`, c.type)
    }
  }
  return out
}

/** Top-level fields for the shared RuleEditor, which builds group paths itself. */
export function filterScope(steps: StepFields[]): Field[] {
  const seen = new Set<string>()
  return steps.flatMap((s) => s.fields).filter((f) => !seen.has(f.key) && (seen.add(f.key), true))
}

export const columnLabel = (c: Column, cols: DataColumn[]) =>
  'meta' in c ? META_LABELS[c.meta] : cols.find((x) => x.path === c.field)?.label ?? c.field

export const aggregateLabel = (a: Aggregate, cols: DataColumn[]) =>
  a.fn === 'count' ? 'Records' : `Total ${columnLabel({ field: a.field }, cols).toLowerCase()}`
