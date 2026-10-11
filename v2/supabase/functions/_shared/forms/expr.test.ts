import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculate, compile } from './expr.ts'

const calc = (e: string, answers: Record<string, unknown> = {}) => calculate(e, answers)

test('arithmetic precedence and parentheses', () => {
  assert.equal(calc('1 + 2 * 3'), 7)
  assert.equal(calc('(1 + 2) * 3'), 9)
  assert.equal(calc('10 - 4 - 3'), 3)
  assert.equal(calc('8 / 4 / 2'), 1)
  assert.equal(calc('-2 * -3'), 6)
})
test('× ÷ − work like * / -', () => {
  assert.equal(calc('6 × 2 ÷ 3 − 1'), 3)
})
test('field references', () => {
  assert.equal(calc('price * qty', { price: 2.5, qty: 4 }), 10)
  assert.equal(calc('a + 1'), null)
  assert.equal(calc('flag + 1', { flag: true }), 2)
})
test('aggregates over repeating-section columns', () => {
  const ans = { items: [{ amount: 5 }, { amount: 7 }, { amount: '' }], tags: ['a', 'b'] }
  assert.equal(calc('sum(items[].amount)', ans), 12)
  assert.equal(calc('count(items)', ans), 3)
  assert.equal(calc('count(items[].amount)', ans), 2)
  assert.equal(calc('min(items[].amount)', ans), 5)
  assert.equal(calc('max(items[].amount, 9)', ans), 9)
  assert.equal(calc('sum(1, 2, 3)'), 6)
  assert.equal(calc('count(tags)', ans), 2)
  assert.equal(calc('sum(none[].x)'), 0)
  assert.equal(calc('min(none[].x)'), null)
})
test('days_between and round', () => {
  assert.equal(calc('days_between(start, end)', { start: '2026-10-01', end: '2026-10-11' }), 10)
  assert.equal(calc('days_between(start, nope)', { start: '2026-10-01' }), null)
  assert.equal(calc('round(10 / 3, 2)'), 3.33)
  assert.equal(calc('round(2.5)'), 3)
  assert.equal(calc('round(1, 11)'), null)
})
test('if with comparisons', () => {
  assert.equal(calc('if(age >= 18, 1, 0)', { age: 18 }), 1)
  assert.equal(calc('if(age >= 18, 1, 0)', { age: 17 }), 0)
  assert.equal(calc('if(1 > 2, 1, 2)'), 2)
  assert.equal(calc('if(end > start, days_between(start, end), 0)', { start: '2026-10-01', end: '2026-10-03' }), 2)
  assert.equal(calc('if(a = 3, 10, 20)', { a: 3 }), 10)
})
test('division by zero and non-numbers give null', () => {
  assert.equal(calc('1 / 0'), null)
  assert.equal(calc('name * 2', { name: 'x' }), null)
})
test('compile reports errors in plain words', () => {
  const cases: [string, RegExp][] = [
    ['', /Enter a formula/],
    ['1 +', /ends too early/],
    ['(1 + 2', /Expected "\)" at position 7/],
    ['foo(1)', /Unknown function "foo"/],
    ['constructor(1)', /Unknown function "constructor"/],
    ['round(1, 2, 3)', /"round" takes 1 to 2 values/],
    ['1 $ 2', /Unexpected "\$" at position 3/],
    ['1 2', /Unexpected "2"/],
    ['('.repeat(60) + '1' + ')'.repeat(60), /nested too deeply/],
    ['1'.repeat(501), /under 500 characters/],
  ]
  for (const [src, msg] of cases) {
    const c = compile(src)
    assert.equal(c.ok, false, src)
    if (!c.ok) assert.match(c.error, msg)
  }
})
test('compile lists the fields a formula reads', () => {
  const c = compile('sum(items[].amount) + fee')
  assert.ok(c.ok)
  if (c.ok) assert.deepEqual(c.refs, [{ key: 'items', col: 'amount' }, { key: 'fee' }])
})
test('never evaluates code', () => {
  assert.equal(calculate('process.exit(1)', {}), null)
  assert.equal(calculate('constructor', {}), null)
  assert.equal(calculate('__proto__ + 1', {}), null)
})
