import type { Answers } from './types.ts'
import { toDay } from './rules.ts'

export type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; key: string; col?: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }

export type Ref = { key: string; col?: string }
export type Compiled = { ok: true; ast: Node; refs: Ref[] } | { ok: false; error: string }

const ARITY: Record<string, [number, number]> = {
  sum: [1, 50], count: [1, 50], min: [1, 50], max: [1, 50], days_between: [2, 2], round: [1, 2], if: [3, 3],
}
const SYMBOLS: Record<string, string> = { '×': '*', '÷': '/', '−': '-' }
const MAX_DEPTH = 40
type Tok = { k: 'num' | 'id' | 'op' | 'end'; v: string; at: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    if (/^\s/.test(rest)) { i++; continue }
    const m = /^(\d+(?:\.\d+)?|\.\d+)/.exec(rest) ??
      /^[a-z][a-z0-9_]*(?:\[\]\.[a-z][a-z0-9_]*)?/.exec(rest) ??
      /^(>=|<=|!=|[-+*/()<>=,])/.exec(rest)
    if (m) {
      const k = /^[\d.]/.test(m[0]) ? 'num' : /^[a-z]/.test(m[0]) ? 'id' : 'op'
      out.push({ k, v: m[0], at: i })
      i += m[0].length
      continue
    }
    if (Object.hasOwn(SYMBOLS, src[i])) { out.push({ k: 'op', v: SYMBOLS[src[i]], at: i }); i++; continue }
    throw new Error(`Unexpected "${src[i]}" at position ${i + 1}.`)
  }
  out.push({ k: 'end', v: '', at: src.length })
  return out
}

function parse(toks: Tok[]): Node {
  let p = 0
  let depth = 0
  const isOp = (...vs: string[]) => toks[p].k === 'op' && vs.includes(toks[p].v)
  const unexpected = (t: Tok) => new Error(t.k === 'end' ? 'The formula ends too early.' : `Unexpected "${t.v}" at position ${t.at + 1}.`)
  const eat = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}" at position ${toks[p].at + 1}.`)
    p++
  }
  function expr(): Node {
    if (++depth > MAX_DEPTH) throw new Error('This formula is nested too deeply.')
    let a = additive()
    if (isOp('>', '<', '>=', '<=', '=', '!=')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: additive() } }
    depth--
    return a
  }
  function additive(): Node {
    let a = term()
    while (isOp('+', '-')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: term() } }
    return a
  }
  function term(): Node {
    let a = unary()
    while (isOp('*', '/')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: unary() } }
    return a
  }
  function unary(): Node {
    if (isOp('-')) { p++; return { t: 'neg', a: unary() } }
    return primary()
  }
  function primary(): Node {
    const t = toks[p]
    if (t.k === 'num') { p++; return { t: 'num', v: Number(t.v) } }
    if (isOp('(')) { p++; const e = expr(); eat(')'); return e }
    if (t.k !== 'id') throw unexpected(t)
    p++
    if (!isOp('(')) {
      const [key, col] = t.v.split('[].')
      return col ? { t: 'ref', key, col } : { t: 'ref', key }
    }
    if (!Object.hasOwn(ARITY, t.v)) throw new Error(`Unknown function "${t.v}".`)
    p++
    const args: Node[] = []
    if (!isOp(')')) {
      args.push(expr())
      while (isOp(',')) { p++; args.push(expr()) }
    }
    eat(')')
    const [lo, hi] = ARITY[t.v]
    if (args.length < lo || args.length > hi) throw new Error(`"${t.v}" takes ${lo === hi ? lo : `${lo} to ${hi}`} values.`)
    return { t: 'call', fn: t.v, args }
  }
  const ast = expr()
  if (toks[p].k !== 'end') throw unexpected(toks[p])
  return ast
}

/** Parses a formula without running it; errors are sentences for the builder. */
export function compile(src: string): Compiled {
  if (typeof src !== 'string' || !src.trim()) return { ok: false, error: 'Enter a formula.' }
  if (src.length > 500) return { ok: false, error: 'Keep the formula under 500 characters.' }
  try {
    const ast = parse(tokenize(src))
    const refs: Ref[] = []
    const walk = (n: Node): void => {
      if (n.t === 'ref') refs.push(n.col ? { key: n.key, col: n.col } : { key: n.key })
      else if (n.t === 'neg') walk(n.a)
      else if (n.t === 'bin') { walk(n.a); walk(n.b) }
      else if (n.t === 'call') n.args.forEach(walk)
    }
    walk(ast)
    return { ok: true, ast, refs }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

type Val = number | string | null | Val[]
const numOf = (v: Val): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const flat = (vals: Val[]): Val[] => vals.flatMap((v) => (Array.isArray(v) ? flat(v) : [v]))
const truthy = (v: Val) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== 0 && v !== '')

function fromAnswer(v: unknown): Val {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') return v
  // A repeating section's rows count as one each; a multi-select's choices stay text.
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? 1 : fromAnswer(x)))
  return null
}

function binary(op: string, a: Val, b: Val): Val {
  if (op === '=' || op === '!=') {
    const eq = a !== null && !Array.isArray(a) && a === b
    return (op === '=') === eq ? 1 : 0
  }
  if (op === '>' || op === '<' || op === '>=' || op === '<=') {
    let x = numOf(a)
    let y = numOf(b)
    if (x === null || y === null) { x = toDay(a); y = toDay(b) }
    if (x === null || y === null) return null
    return (op === '>' ? x > y : op === '<' ? x < y : op === '>=' ? x >= y : x <= y) ? 1 : 0
  }
  const x = numOf(a)
  const y = numOf(b)
  if (x === null || y === null) return null
  if (op === '+') return x + y
  if (op === '-') return x - y
  if (op === '*') return x * y
  return y === 0 ? null : x / y
}

function call(fn: string, args: Node[], ans: Answers): Val {
  if (fn === 'if') return truthy(run(args[0], ans)) ? run(args[1], ans) : run(args[2], ans)
  const vals = args.map((a) => run(a, ans))
  if (fn === 'days_between') {
    const a = toDay(vals[0])
    const b = toDay(vals[1])
    return a === null || b === null ? null : b - a
  }
  if (fn === 'round') {
    const x = numOf(vals[0])
    const d = vals.length > 1 ? numOf(vals[1]) : 0
    if (x === null || d === null || !Number.isInteger(d) || d < 0 || d > 10) return null
    return Math.round(x * 10 ** d) / 10 ** d
  }
  const items = flat(vals)
  if (fn === 'count') return items.filter((v) => v !== null && v !== '').length
  const nums = items.map(numOf).filter((v): v is number => v !== null)
  if (fn === 'sum') return nums.reduce((s, v) => s + v, 0)
  if (!nums.length) return null
  return fn === 'min' ? Math.min(...nums) : Math.max(...nums)
}

function run(n: Node, ans: Answers): Val {
  switch (n.t) {
    case 'num': return n.v
    case 'ref': {
      const v = Object.hasOwn(ans, n.key) ? ans[n.key] : undefined
      const col = n.col
      if (!col) return fromAnswer(v)
      return Array.isArray(v)
        ? v.map((r) => (r && typeof r === 'object' && Object.hasOwn(r, col) ? fromAnswer((r as Answers)[col]) : null))
        : []
    }
    case 'neg': { const a = numOf(run(n.a, ans)); return a === null ? null : -a }
    case 'bin': return binary(n.op, run(n.a, ans), run(n.b, ans))
    case 'call': return call(n.fn, n.args, ans)
  }
}

/** Value of a calculated field, or null when it cannot be computed. Never throws, never evals. */
export function calculate(expression: string, answers: Answers): number | null {
  const c = compile(expression)
  if (!c.ok) return null
  try {
    const v = run(c.ast, answers && typeof answers === 'object' ? answers : {})
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null // spec §4.4: a formula that cannot be computed leaves the field empty
  }
}
