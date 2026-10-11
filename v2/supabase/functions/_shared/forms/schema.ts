import { FIELD_TYPES, OPERATORS, type Field, type FieldType } from './types.ts'
import { compile } from './expr.ts'
import { parsePath } from './rules.ts'

export type SchemaIssue = { key: string; message: string }
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/
export const SECTION_FIELD_TYPES: readonly FieldType[] = [
  'short_text', 'long_text', 'number', 'date', 'single_select', 'multi_select', 'checkbox', 'file', 'signature',
]
type Add = (message: string) => void
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Checks a form definition; the builder shows the issues, submit-form refuses a form that has any. */
export function validateSchema(input: unknown): SchemaIssue[] {
  if (!Array.isArray(input)) return [{ key: '', message: 'The form definition must be a list of fields.' }]
  if (input.length > 200) return [{ key: '', message: 'A form can have at most 200 fields.' }]
  const issues: SchemaIssue[] = []
  const fields = input.filter(isObj) as Field[]
  if (fields.length !== input.length) issues.push({ key: '', message: 'Every field must be an object.' })
  checkList(fields, [], issues, null)
  return issues
}

function checkList(fields: Field[], outer: Field[], issues: SchemaIssue[], group: Field | null) {
  const seen = new Set<string>()
  fields.forEach((f, i) => {
    const key = typeof f.key === 'string' ? f.key : ''
    const add: Add = (message) => issues.push({ key: group ? `${group.key}.${key}` : key, message })
    if (!KEY_RE.test(key)) add('Use a key of lowercase letters, numbers and underscores, starting with a letter.')
    else if (seen.has(key)) add(`The key "${key}" is used twice.`)
    seen.add(key)
    if (!(FIELD_TYPES as readonly string[]).includes(f.type)) return add('Choose a field type.')
    if (group && !SECTION_FIELD_TYPES.includes(f.type)) add('A repeating section cannot contain page breaks, sections or calculated fields.')
    if (f.type !== 'page_break' && (typeof f.label !== 'string' || !f.label.trim() || f.label.length > 200)) add('Give the field a label under 200 characters.')
    if (f.help !== undefined && (typeof f.help !== 'string' || f.help.length > 500)) add('Keep the help text under 500 characters.')
    if (f.type === 'single_select' || f.type === 'multi_select') checkOptions(f.options, add)
    if (f.type === 'group' && !group) checkGroup(f, fields, issues, add)
    if (f.type === 'calculated') checkExpression(f, fields.slice(0, i), add)
    if (f.show_if !== undefined) checkRule(f.show_if, key, group ? [...outer, ...fields] : fields, add)
  })
}

function checkOptions(options: unknown, add: Add) {
  if (!Array.isArray(options) || options.length === 0 || options.length > 100) return add('Add between 1 and 100 options.')
  if (options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 200)) return add('Options must be text under 200 characters.')
  if (new Set(options).size !== options.length) add('Each option must be different.')
}

function checkGroup(f: Field, top: Field[], issues: SchemaIssue[], add: Add) {
  const r = f.repeat
  if (!isObj(r) || !Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min < 0 || r.max < 1 || r.min > r.max || r.max > 50) {
    add('Set rows between 0 and 50, with the minimum not above maximum.')
  }
  if (!Array.isArray(f.fields) || f.fields.length === 0 || f.fields.length > 50) return add('Add between 1 and 50 fields to the section.')
  checkList(f.fields.filter(isObj) as Field[], top, issues, f)
}

function checkExpression(f: Field, earlier: Field[], add: Add) {
  const c = compile(f.expression ?? '')
  if (!c.ok) return add(c.error)
  for (const r of c.refs) {
    const target = earlier.find((e) => e.key === r.key && e.type !== 'page_break')
    if (!target) { add(`"${r.key}" must be a field above this one.`); continue }
    if (r.col && !(target.type === 'group' && target.fields?.some((x) => x.key === r.col))) {
      add(`"${r.key}[].${r.col}" is not a column of a repeating section.`)
    }
  }
}

function checkRule(rule: unknown, self: string, scope: Field[], add: Add) {
  if (!isObj(rule) || typeof rule.field !== 'string' || !(OPERATORS as readonly string[]).includes(rule.operator as string)) {
    return add('Finish the show-if rule: choose a field and a condition.')
  }
  const p = parsePath(rule.field)
  const target = p && p.root !== self ? scope.find((f) => f.key === p.root && f.type !== 'page_break') : undefined
  if (!p || !target) return add('The show-if rule points at a field that does not exist.')
  if ((p.col || p.count) && target.type !== 'group') return add('Only repeating sections support [] and .count.')
  if (p.col && !target.fields?.some((c) => c.key === p.col)) return add('The show-if rule points at a column that does not exist.')
  const op = rule.operator
  if (op === 'is_empty' || op === 'is_not_empty') return
  const v = rule.value
  const ok = op === 'is_one_of' ? Array.isArray(v) && v.length > 0
    : op === 'within_days' ? typeof v === 'number' && v >= 0
    : v !== undefined && v !== null && v !== ''
  if (!ok) add('Give the show-if rule a value.')
}
