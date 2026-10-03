import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeMoney } from '../ledger.ts'

test('makeMoney formats in the firm currency', () => {
  assert.equal(makeMoney('MYR').format(123450), 'RM\u00a01,234.50')
  assert.equal(makeMoney('SGD').format(-5000), '-SGD\u00a050.00')
  assert.equal(makeMoney('MYR').compact(8140000), 'RM\u00a081.4K')
})
