import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pages, resolve, validateAnswers, visiblePages } from './answers.ts'
import { FORM, PREFIX, VALID } from './fixture.ts'
import type { Field } from './types.ts'

const now = new Date('2026-10-11T12:00:00Z')
const check = (answers: unknown, extra = {}) => validateAnswers(FORM, answers, { now, filePrefix: PREFIX, ...extra })
const errorsOf = (answers: unknown, extra = {}) => {
  const r = check(answers, extra)
  return r.ok ? {} : r.errors
}

test('a complete submission passes and calculated values are recomputed', () => {
  const r = check({ ...VALID, days: 99, total: 9999 })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.answers.days, 3)
    assert.equal(r.answers.total, 12.5)
  }
})
test('unknown keys and page breaks are dropped', () => {
  const r = check({ ...VALID, hack: 1, p2: 'x' })
  assert.ok(r.ok && !('hack' in r.answers) && !('p2' in r.answers))
})
test('required fields are reported by key', () => {
  assert.deepEqual(errorsOf({}), {
    name: 'This field is required.', leave_type: 'This field is required.', start: 'This field is required.',
    end: 'This field is required.', agree: 'Tick this box to continue.', sig: 'This field is required.',
  })
})
test('a hidden required field is not required, and its answer is stripped', () => {
  const r = check({ ...VALID, other_reason: 'smuggled', mc: `${PREFIX}x.pdf` })
  assert.ok(r.ok && !('other_reason' in r.answers) && !('mc' in r.answers))
  assert.deepEqual(errorsOf({ ...VALID, leave_type: 'Medical' }), { mc: 'This field is required.' })
  assert.deepEqual(errorsOf({ ...VALID, leave_type: 'Other' }), { other_reason: 'This field is required.' })
})
test("files must sit in the caller's own folder", () => {
  const other = '0000000a-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a2/sig.png'
  assert.deepEqual(errorsOf({ ...VALID, sig: other }), { sig: 'Sign again.' })
  assert.deepEqual(errorsOf({ ...VALID, sig: '../../etc/passwd' }), { sig: 'Sign again.' })
})
test('values must match their field type', () => {
  assert.deepEqual(errorsOf({ ...VALID, name: 5, start: '2026-02-30', leave_type: 'Sabbatical', cover: ['Peer', 'Peer'], agree: 'yes' }), {
    name: 'Enter text.', start: 'Enter a valid date.', leave_type: 'Choose one of the options.',
    cover: 'Choose from the listed options.', agree: 'Tick or untick this box.',
  })
})
test('repeating sections enforce row counts and validate each row', () => {
  assert.deepEqual(errorsOf({ ...VALID, claims: [{ item: 'Taxi' }, { amount: 3 }] }), {
    'claims.0.amount': 'This field is required.', 'claims.1.item': 'This field is required.',
  })
  const four = ['a', 'b', 'c', 'd'].map((item) => ({ item, amount: 1 }))
  assert.deepEqual(errorsOf({ ...VALID, claims: four }), { claims: 'Add no more than 3 rows.' })
  assert.deepEqual(errorsOf({ ...VALID, claims: ['x'] }), { claims: 'Fill in the section again.' })
  const r = check({ ...VALID, claims: [{ item: 'Taxi', amount: 2, extra: 'x' }] })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.answers.claims, [{ item: 'Taxi', amount: 2 }])
})
test('onlyKeys limits validation to one page', () => {
  const page1 = new Set(pages(FORM)[0].map((f) => f.key))
  assert.deepEqual(errorsOf({ name: 'Ada' }, { onlyKeys: page1 }), { leave_type: 'This field is required.' })
})
test('pages split at page breaks and fully hidden pages are skipped', () => {
  assert.deepEqual(pages(FORM).map((p) => p.length), [5, 5, 5])
  const f = [
    { key: 'a', type: 'checkbox', label: 'A' },
    { key: 'b', type: 'page_break', label: 'B' },
    { key: 'c', type: 'short_text', label: 'C', show_if: { field: 'a', operator: 'is', value: true } },
    { key: 'd', type: 'page_break', label: 'D' },
    { key: 'e', type: 'short_text', label: 'E' },
  ] as Field[]
  assert.deepEqual(visiblePages(f, {}, now), [0, 2])
  assert.deepEqual(visiblePages(f, { a: true }, now), [0, 1, 2])
})
test('non-object answers never throw', () => {
  for (const bad of [null, 'x', 42, []]) assert.equal(check(bad).ok, false)
  assert.equal(resolve(FORM, null, now).answers.total, 0)
})
