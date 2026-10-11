import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIELD_TYPES, validateSchema, type Field } from '../logic.ts'
import { move, newField, parseValue, ruleTarget, rulePaths, uniqueKey, valueText } from './builderOps.ts'

test('uniqueKey skips taken keys', () => {
  assert.equal(uniqueKey('number', []), 'number_1')
  assert.equal(uniqueKey('number', ['number_1', 'number_2']), 'number_3')
})
test('every new field type is valid on its own', () => {
  for (const t of FIELD_TYPES) assert.deepEqual(validateSchema([newField(t, [])]), [], t)
})
test('move reorders without mutating and ignores out-of-range moves', () => {
  const list = ['a', 'b', 'c']
  assert.deepEqual(move(list, 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(move(list, 2, 0), ['c', 'a', 'b'])
  assert.equal(move(list, 0, 3), list)
  assert.deepEqual(list, ['a', 'b', 'c'])
})
const scope = [
  { key: 'a', type: 'number', label: 'Age' },
  { key: 'p', type: 'page_break', label: 'P' },
  { key: 'kids', type: 'group', label: 'Children', repeat: { min: 0, max: 3 }, fields: [{ key: 'name', type: 'short_text', label: 'Name' }] },
  { key: 'me', type: 'number', label: 'Me' },
] as Field[]
test('rulePaths offers fields, section columns and row counts, never the field itself or page breaks', () => {
  assert.deepEqual(rulePaths(scope, 'me').map((p) => p.value), ['a', 'kids.count', 'kids[].name'])
  assert.equal(rulePaths(scope, 'me')[2].label, 'Children: Name (any row)')
})
test('ruleTarget finds the field a path reads', () => {
  assert.equal(ruleTarget(scope, 'a')?.type, 'number')
  assert.equal(ruleTarget(scope, 'kids.count')?.type, 'number')
  assert.equal(ruleTarget(scope, 'kids[].name')?.type, 'short_text')
  assert.equal(ruleTarget(scope, 'gone'), undefined)
})
test('rule values round-trip through text', () => {
  assert.deepEqual(parseValue('is_one_of', 'a, b ,, c'), ['a', 'b', 'c'])
  assert.equal(parseValue('within_days', '7'), 7)
  assert.equal(parseValue('within_days', ' '), undefined)
  assert.equal(parseValue('is', 'Other'), 'Other')
  assert.equal(valueText(['a', 'b']), 'a, b')
  assert.equal(valueText(undefined), '')
})
