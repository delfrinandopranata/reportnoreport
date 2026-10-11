import { parsePath, type Field, type FieldType, type Operator } from '../logic.ts'

export const TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short text', long_text: 'Long text', number: 'Number', date: 'Date',
  single_select: 'Single select', multi_select: 'Multi select', checkbox: 'Checkbox', file: 'File upload',
  signature: 'Signature', page_break: 'Page break', group: 'Repeating section', calculated: 'Calculated',
}

export const TYPE_HINTS: Record<FieldType, string> = {
  short_text: 'One line, up to 500 characters', long_text: 'A paragraph, up to 10,000 characters', number: 'Any number',
  date: 'A calendar day', single_select: 'Choose one option', multi_select: 'Choose any options', checkbox: 'A box to tick',
  file: 'One file, up to 10 MB', signature: 'Drawn or typed', page_break: 'Starts a new page',
  group: 'A set of fields people can repeat', calculated: 'A number worked out from other answers',
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) {
    const key = `${base.slice(0, 36)}_${n}`
    if (!used.has(key)) return key
  }
}

export function newField(type: FieldType, taken: Iterable<string>): Field {
  const key = uniqueKey(type, taken)
  const label = TYPE_LABELS[type]
  if (type === 'page_break') return { key, type, label: 'New page' }
  if (type === 'single_select' || type === 'multi_select') return { key, type, label, options: ['Option 1', 'Option 2'] }
  if (type === 'group') return { key, type, label, repeat: { min: 0, max: 5 }, fields: [{ key: 'item_1', type: 'short_text', label: 'Item' }] }
  if (type === 'calculated') return { key, type, label, expression: '0' }
  return { key, type, label }
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function rulePaths(scope: Field[], self: string): { value: string; label: string }[] {
  return scope.filter((f) => f.key !== self && f.type !== 'page_break').flatMap((f) => (f.type === 'group'
    ? [
      { value: `${f.key}.count`, label: `${f.label}: number of rows` },
      ...(f.fields ?? []).map((c) => ({ value: `${f.key}[].${c.key}`, label: `${f.label}: ${c.label} (any row)` })),
    ]
    : [{ value: f.key, label: f.label }]))
}

/** The field a rule path reads; a row count reads as a number. */
export function ruleTarget(scope: Field[], path: string): Field | undefined {
  const p = parsePath(path)
  if (!p) return undefined
  const root = scope.find((f) => f.key === p.root)
  if (p.count) return root && { ...root, type: 'number' }
  return p.col ? root?.fields?.find((c) => c.key === p.col) : root
}

export const valueText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v))

export function parseValue(op: Operator, text: string): unknown {
  if (op === 'is_one_of') return text.split(',').map((s) => s.trim()).filter(Boolean)
  if (op === 'within_days') return text.trim() === '' ? undefined : Number(text)
  return text
}
