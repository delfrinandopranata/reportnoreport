import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeMoney } from '../ledger.ts'

test('makeMoney formats with the currency local symbol', () => {
  assert.equal(makeMoney('MYR').format(123450), 'RM 1,234.50')
  assert.equal(makeMoney('SGD').format(-5000), '-S$50.00')
  assert.equal(makeMoney('USD').format(100), 'US$1.00')
  assert.equal(makeMoney('MYR').compact(8140000), 'RM 81.4K')
  assert.equal(makeMoney('USD').format(5000), 'US$50.00')
  assert.match(makeMoney('EUR').format(100), /^EUR\s?1\.00$/)
})
