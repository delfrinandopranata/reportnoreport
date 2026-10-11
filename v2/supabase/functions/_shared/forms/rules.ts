import { OPERATORS, type Answers, type Operator, type Rule } from './types.ts'

const KEY = '[a-z][a-z0-9_]{0,39}'
const PATH = new RegExp(`^(${KEY})(?:\\[\\]\\.(${KEY})|\\.(count))?$`)
const DAY_MS = 86_400_000

/** Days since 1970-01-01 for a real YYYY-MM-DD date, else null. */
export function toDay(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t / DAY_MS : null
}

/** Today as a UTC day number, so browser and server agree. */
export const todayOf = (now: Date) => Math.floor(now.getTime() / DAY_MS)

export function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === false ||
    (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
}

export function parsePath(path: unknown): { root: string; col?: string; count: boolean } | null {
  const m = typeof path === 'string' ? PATH.exec(path) : null
  return m ? { root: m[1], col: m[2], count: !!m[3] } : null
}

/** Candidate values for a path (several for `group[].field`), or null when it cannot be read. */
export function readPath(answers: Answers, path: string): unknown[] | null {
  const p = parsePath(path)
  if (!p || !answers || typeof answers !== 'object') return null
  const v = Object.hasOwn(answers, p.root) ? answers[p.root] : undefined
  if (!p.col && !p.count) return [v]
  if (v === undefined || v === null) return p.count ? [0] : []
  if (!Array.isArray(v)) return null
  if (p.count) return [v.length]
  if (v.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return null
  const col = p.col as string
  return v.map((r) => (Object.hasOwn(r, col) ? (r as Answers)[col] : undefined))
}

const isScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
const same = (a: unknown, b: unknown) => isScalar(a) && isScalar(b) && String(a) === String(b)
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)

function compare(v: unknown, target: unknown): number | null {
  const a = num(v)
  const b = num(target)
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b
  const da = toDay(v)
  const db = toDay(target)
  return da !== null && db !== null ? da - db : null
}

function check(op: Operator, v: unknown, target: unknown, now: Date): boolean {
  switch (op) {
    case 'is_empty': return isEmpty(v)
    case 'is_not_empty': return !isEmpty(v)
    case 'is': return same(v, target)
    case 'is_not': return !same(v, target)
    case 'is_one_of':
      if (!Array.isArray(target)) return false
      return Array.isArray(v) ? v.some((x) => target.some((t) => same(x, t))) : target.some((t) => same(v, t))
    case 'contains':
      if (Array.isArray(v)) return v.some((x) => same(x, target))
      return typeof v === 'string' && typeof target === 'string' && target !== '' &&
        v.toLowerCase().includes(target.toLowerCase())
    case 'gt': { const c = compare(v, target); return c !== null && c > 0 }
    case 'lt': { const c = compare(v, target); return c !== null && c < 0 }
    case 'within_days': {
      const d = toDay(v)
      const n = num(target)
      return d !== null && Number.isFinite(n) && n >= 0 && Math.abs(d - todayOf(now)) <= n
    }
  }
}

/** The one evaluator for show_if, Condition cards, report filters and audiences (spec §4.3). */
export function evaluate(rule: Rule, answers: Answers, now: Date = new Date()): boolean {
  try {
    if (!rule || typeof rule !== 'object' || !(OPERATORS as readonly string[]).includes(rule.operator)) return false
    const values = readPath(answers, rule.field)
    return values !== null && values.some((v) => check(rule.operator, v, rule.value, now))
  } catch {
    return false // spec §4.3: an unreadable value makes a rule false, never throws
  }
}
