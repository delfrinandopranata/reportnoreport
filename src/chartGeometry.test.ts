import { test } from 'node:test'
import assert from 'node:assert/strict'
import { axisGutter } from './chartGeometry.ts'

test('the axis gutter grows with the longest tick label so its first letter is never clipped', () => {
  assert.equal(axisGutter(['MYR 0', 'MYR 5K', 'MYR 10K']), 64)
  assert.ok(axisGutter(['MYR 0', 'MYR 6.2K', 'MYR 12.4K']) >= 'MYR 12.4K'.length * 7 + 8)
  assert.ok(axisGutter(['MYR 123.4M']) > axisGutter(['MYR 12.4K']))
})
