import type { Answers, Field } from './types.ts'
import { evaluate, isEmpty, parsePath, toDay } from './rules.ts'
import { calculate } from './expr.ts'

export type Resolved = { answers: Answers; hidden: Set<string> }
export type CheckOptions = { now?: Date; filePrefix?: string; onlyKeys?: ReadonlySet<string> }
export type Checked = { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> }

const isObj = (v: unknown): v is Answers => !!v && typeof v === 'object' && !Array.isArray(v)
const FILE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/

/** Splits at each page_break; the break opens (and titles) the next page. Empty pages are dropped. */
export function pages(fields: Field[]): Field[][] {
  const out: Field[][] = [[]]
  for (const f of fields) {
    if (f.type === 'page_break') out.push([f])
    else out[out.length - 1].push(f)
  }
  return out.filter((p) => p.some((f) => f.type !== 'page_break'))
}

/** Keeps schema keys only, drops answers to hidden fields and recomputes every calculated field. */
export function resolve(fields: Field[], raw: unknown, now: Date = new Date()): Resolved {
  const input: Answers = isObj(raw) ? raw : {}
  const answers: Answers = {}
  const hidden = new Set<string>()
  for (const f of fields) {
    if (f.type !== 'page_break' && f.type !== 'calculated' && Object.hasOwn(input, f.key)) answers[f.key] = input[f.key]
  }
  const calcs = fields.filter((f) => f.type === 'calculated')
  const fillCalcs = () => {
    for (const f of calcs) if (!hidden.has(f.key)) answers[f.key] = calculate(f.expression ?? '', answers)
  }
  fillCalcs() // first pass so a show_if may read a calculated value
  // Dependency order: a field is judged against answers with hidden fields removed.
  // A field met again while still being judged (a show_if cycle) counts as hidden.
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const pending = new Set<string>()
  const done = new Set<string>()
  const judge = (f: Field) => {
    if (done.has(f.key) || pending.has(f.key)) return
    pending.add(f.key)
    if (f.show_if) {
      const dep = parsePath(f.show_if.field)?.root
      const target = dep ? byKey.get(dep) : undefined
      if (target) judge(target)
      const view: Answers = {}
      for (const k of Object.keys(answers)) if (!hidden.has(k) && !pending.has(k)) view[k] = answers[k]
      pending.delete(f.key)
      if (!evaluate(f.show_if, view, now)) hidden.add(f.key)
    }
    pending.delete(f.key)
    done.add(f.key)
  }
  for (const f of fields) judge(f)
  for (const k of hidden) delete answers[k]
  for (const f of fields) {
    const rows = answers[f.key]
    if (f.type !== 'group' || !Array.isArray(rows)) continue
    answers[f.key] = rows.map((row) => {
      if (!isObj(row)) return row
      const clean: Answers = {}
      for (const c of f.fields ?? []) {
        if (!Object.hasOwn(row, c.key)) continue
        if (c.show_if && !evaluate(c.show_if, { ...answers, ...row }, now)) continue
        clean[c.key] = row[c.key]
      }
      return clean
    })
  }
  fillCalcs() // second pass sees only visible answers
  return { answers, hidden }
}

export function visiblePages(fields: Field[], raw: unknown, now: Date = new Date()): number[] {
  const { hidden } = resolve(fields, raw, now)
  return pages(fields).flatMap((p, i) => (p.some((f) => f.type !== 'page_break' && !hidden.has(f.key)) ? [i] : []))
}

const text = (v: unknown, max: number) =>
  typeof v !== 'string' ? 'Enter text.' : v.length > max ? `Keep this under ${max.toLocaleString('en-GB')} characters.` : null

function checkValue(f: Field, v: unknown, prefix?: string): string | null {
  if (isEmpty(v)) return f.required ? (f.type === 'checkbox' ? 'Tick this box to continue.' : 'This field is required.') : null
  switch (f.type) {
    case 'short_text': return text(v, 500)
    case 'long_text': return text(v, 10000)
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? null : 'Enter a number.'
    case 'date': return toDay(v) !== null ? null : 'Enter a valid date.'
    case 'single_select': return typeof v === 'string' && !!f.options?.includes(v) ? null : 'Choose one of the options.'
    case 'multi_select':
      return Array.isArray(v) && new Set(v).size === v.length && v.every((x) => typeof x === 'string' && !!f.options?.includes(x))
        ? null : 'Choose from the listed options.'
    case 'checkbox': return v === true ? null : 'Tick or untick this box.'
    case 'file':
    case 'signature': {
      const ok = typeof v === 'string' && FILE_PATH.test(v) && (!prefix || v.startsWith(prefix))
      return ok ? null : f.type === 'file' ? 'Upload the file again.' : 'Sign again.'
    }
    default: return null
  }
}

function checkGroup(f: Field, answers: Answers, errors: Record<string, string>, opts: CheckOptions, now: Date) {
  const rows = answers[f.key] ?? []
  const { min, max } = f.repeat ?? { min: 0, max: 50 }
  const need = Math.max(min, f.required ? 1 : 0)
  const rowsWord = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`
  if (!Array.isArray(rows) || rows.some((r) => !isObj(r))) { errors[f.key] = 'Fill in the section again.'; return }
  if (rows.length < need) { errors[f.key] = `Add at least ${rowsWord(need)}.`; return }
  if (rows.length > max) { errors[f.key] = `Add no more than ${rowsWord(max)}.`; return }
  rows.forEach((row: Answers, i) => {
    for (const c of f.fields ?? []) {
      if (c.show_if && !evaluate(c.show_if, { ...answers, ...row }, now)) continue
      const msg = checkValue(c, row[c.key], opts.filePrefix)
      if (msg) errors[`${f.key}.${i}.${c.key}`] = msg
      else if (isEmpty(row[c.key])) delete row[c.key]
    }
  })
  if (rows.length === 0) delete answers[f.key]
}

/** Shared by the browser (per page, for UX) and submit-form (whole form, the authority). */
export function validateAnswers(fields: Field[], raw: unknown, opts: CheckOptions = {}): Checked {
  const now = opts.now ?? new Date()
  if (!isObj(raw)) return { ok: false, errors: { '': 'Send the answers as an object.' } }
  const { answers, hidden } = resolve(fields, raw, now)
  const errors: Record<string, string> = {}
  for (const f of fields) {
    if (f.type === 'page_break' || f.type === 'calculated' || hidden.has(f.key)) continue
    if (opts.onlyKeys && !opts.onlyKeys.has(f.key)) continue
    if (f.type === 'group') { checkGroup(f, answers, errors, opts, now); continue }
    const msg = checkValue(f, answers[f.key], opts.filePrefix)
    if (msg) errors[f.key] = msg
    else if (isEmpty(answers[f.key])) delete answers[f.key]
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers }
}
