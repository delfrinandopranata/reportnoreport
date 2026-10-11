import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stepLabels } from './stepModel.ts'
import type { Field } from '../logic'

const f = (key: string, type: string, label?: string) => ({ key, type, label }) as unknown as Field

test('steps are named by their page breaks', () => {
  assert.deepEqual(stepLabels([
    [f('name', 'text', 'Full name')],
    [f('p2', 'page_break', 'Dates'), f('from', 'date', 'From')],
    [f('p3', 'page_break', '   '), f('sig', 'signature', 'Sign')],
    [f('p4', 'page_break')],
  ]), ['Step 1', 'Dates', 'Step 3', 'Step 4'])
})
