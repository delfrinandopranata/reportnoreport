import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeMoney } from '../ledger.ts'

// Output is always `<CODE><regular space><number>`, minus sign first.
test('makeMoney formats with the ISO currency code and a single space', () => {
  assert.equal(makeMoney('MYR').format(123450), 'MYR 1,234.50')
  assert.equal(makeMoney('SGD').format(-5000), '-SGD 50.00')
  assert.equal(makeMoney('USD').format(5000), 'USD 50.00')
  assert.equal(makeMoney('EUR').format(100), 'EUR 1.00')
  assert.equal(makeMoney('MYR').compact(8140000), 'MYR 81.4K')
})
