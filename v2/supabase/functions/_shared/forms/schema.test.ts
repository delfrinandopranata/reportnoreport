import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSchema } from './schema.ts'
import { FORM } from './fixture.ts'

const text = (fields: unknown) => validateSchema(fields).map((i) => `${i.key}: ${i.message}`).join('\n')
const withA = (f: Record<string, unknown>) => text([{ key: 'a', type: 'short_text', label: 'A' }, f])

test('the fixture form with all 12 field types is valid', () => {
  assert.equal(text(FORM), '')
  const types = new Set([...FORM, ...FORM.flatMap((f) => f.fields ?? [])].map((f) => f.type))
  assert.equal(types.size, 12)
})
test('form-level shape', () => {
  assert.match(text('x'), /must be a list of fields/)
  assert.match(text(Array.from({ length: 201 }, (_, i) => ({ key: `f${i}`, type: 'number', label: 'N' }))), /at most 200 fields/)
  assert.match(text([1]), /Every field must be an object/)
})
test('keys, types and labels', () => {
  assert.match(withA({ key: 'Bad key', type: 'number', label: 'N' }), /^Bad key: Use a key of lowercase/m)
  assert.match(withA({ key: 'a', type: 'number', label: 'N' }), /^a: The key "a" is used twice/m)
  assert.match(withA({ key: 'b', type: 'rating', label: 'R' }), /^b: Choose a field type/m)
  assert.match(withA({ key: 'b', type: 'number', label: ' ' }), /^b: Give the field a label/m)
  assert.equal(withA({ key: 'b', type: 'page_break' }), '')
})
test('select options', () => {
  assert.match(withA({ key: 'b', type: 'single_select', label: 'S', options: [] }), /between 1 and 100 options/)
  assert.match(withA({ key: 'b', type: 'multi_select', label: 'S', options: ['x', 'x'] }), /Each option must be different/)
})
test('repeating sections', () => {
  const g = (over: Record<string, unknown>) => withA({ key: 'g', type: 'group', label: 'G', repeat: { min: 0, max: 2 }, fields: [{ key: 'x', type: 'number', label: 'X' }], ...over })
  assert.equal(g({}), '')
  assert.match(g({ repeat: { min: 3, max: 2 } }), /minimum not above maximum/)
  assert.match(g({ fields: [] }), /between 1 and 50 fields/)
  assert.match(g({ fields: [{ key: 'x', type: 'calculated', label: 'X', expression: '1' }] }), /^g\.x: A repeating section cannot contain/m)
  assert.match(g({ fields: [{ key: 'x', type: 'number', label: 'X' }, { key: 'x', type: 'date', label: 'Y' }] }), /^g\.x: The key "x" is used twice/m)
})
test('calculated formulas must parse and read fields above them', () => {
  assert.match(withA({ key: 'c', type: 'calculated', label: 'C', expression: 'a +' }), /^c: The formula ends too early/m)
  assert.match(text([{ key: 'c', type: 'calculated', label: 'C', expression: 'b * 2' }, { key: 'b', type: 'number', label: 'B' }]), /"b" must be a field above this one/)
  assert.match(withA({ key: 'c', type: 'calculated', label: 'C', expression: 'sum(a[].x)' }), /"a\[\]\.x" is not a column/)
})
test('show_if must point at a real field with a usable value', () => {
  const rule = (show_if: unknown) => withA({ key: 'b', type: 'number', label: 'B', show_if })
  assert.equal(rule({ field: 'a', operator: 'is', value: 'x' }), '')
  assert.match(rule({ field: 'zzz', operator: 'is', value: 'x' }), /points at a field that does not exist/)
  assert.match(rule({ field: 'b', operator: 'is_empty' }), /points at a field that does not exist/)
  assert.match(rule({ field: 'a', operator: 'is_one_of', value: 'x' }), /Give the show-if rule a value/)
  assert.match(rule({ field: 'a.count', operator: 'gt', value: 1 }), /Only repeating sections support/)
  assert.match(rule({ field: 'a', operator: 'nope' }), /Finish the show-if rule/)
})
