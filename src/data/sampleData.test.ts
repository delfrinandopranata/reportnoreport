import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { sampleControls } from './sampleData.ts'

describe('sampleControls', () => {
  describe('owner role', () => {
    test('no sample data: can import', () => {
      const result = sampleControls('owner', false)
      assert.deepEqual(result, { canImport: true, canRemove: false, canViewBanner: false })
    })
    test('with sample data: can remove and view banner', () => {
      const result = sampleControls('owner', true)
      assert.deepEqual(result, { canImport: false, canRemove: true, canViewBanner: true })
    })
  })

  describe('admin role', () => {
    test('no sample data: can import', () => {
      const result = sampleControls('admin', false)
      assert.deepEqual(result, { canImport: true, canRemove: false, canViewBanner: false })
    })
    test('with sample data: can remove and view banner', () => {
      const result = sampleControls('admin', true)
      assert.deepEqual(result, { canImport: false, canRemove: true, canViewBanner: true })
    })
  })

  describe('accountant role', () => {
    test('no sample data: cannot import', () => {
      const result = sampleControls('accountant', false)
      assert.deepEqual(result, { canImport: false, canRemove: false, canViewBanner: false })
    })
    test('with sample data: cannot remove but can view banner', () => {
      const result = sampleControls('accountant', true)
      assert.deepEqual(result, { canImport: false, canRemove: false, canViewBanner: true })
    })
  })

  describe('viewer role', () => {
    test('no sample data: cannot import', () => {
      const result = sampleControls('viewer', false)
      assert.deepEqual(result, { canImport: false, canRemove: false, canViewBanner: false })
    })
    test('with sample data: cannot remove but can view banner', () => {
      const result = sampleControls('viewer', true)
      assert.deepEqual(result, { canImport: false, canRemove: false, canViewBanner: true })
    })
  })
})
