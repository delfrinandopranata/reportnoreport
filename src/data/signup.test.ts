import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { pendingFirmFromMetadata, isEarlyAccessFull } from './signup.ts'

test('pendingFirmFromMetadata: returns null when meta is null', () => {
  const result = pendingFirmFromMetadata(null)
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: returns null when meta is undefined', () => {
  const result = pendingFirmFromMetadata(undefined)
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: returns null when meta is not an object', () => {
  const result = pendingFirmFromMetadata('not an object')
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: returns null when firm_name is missing', () => {
  const meta = { currency: 'MYR', name: 'John Doe' }
  const result = pendingFirmFromMetadata(meta)
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: returns null when currency is missing', () => {
  const meta = { firm_name: 'Test Co', name: 'John Doe' }
  const result = pendingFirmFromMetadata(meta)
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: returns null when name is missing', () => {
  const meta = { firm_name: 'Test Co', currency: 'MYR' }
  const result = pendingFirmFromMetadata(meta)
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: returns null when currency is not MYR/SGD/USD', () => {
  const meta = { firm_name: 'Test Co', currency: 'GBP', name: 'John Doe' }
  const result = pendingFirmFromMetadata(meta)
  assert.equal(result, null)
})

test('pendingFirmFromMetadata: extracts valid MYR metadata', () => {
  const meta = { firm_name: 'Test Co Sdn Bhd', currency: 'MYR', name: 'John Doe' }
  const result = pendingFirmFromMetadata(meta)
  assert.deepEqual(result, { firmName: 'Test Co Sdn Bhd', currency: 'MYR', personName: 'John Doe' })
})

test('pendingFirmFromMetadata: extracts valid SGD metadata', () => {
  const meta = { firm_name: 'Test Pte Ltd', currency: 'SGD', name: 'Jane Smith' }
  const result = pendingFirmFromMetadata(meta)
  assert.deepEqual(result, { firmName: 'Test Pte Ltd', currency: 'SGD', personName: 'Jane Smith' })
})

test('pendingFirmFromMetadata: extracts valid USD metadata', () => {
  const meta = { firm_name: 'Test Inc', currency: 'USD', name: 'Bob Jones' }
  const result = pendingFirmFromMetadata(meta)
  assert.deepEqual(result, { firmName: 'Test Inc', currency: 'USD', personName: 'Bob Jones' })
})

test('pendingFirmFromMetadata: ignores extra properties', () => {
  const meta = { firm_name: 'Test Co', currency: 'MYR', name: 'John Doe', extra: 'ignored', another: 123 }
  const result = pendingFirmFromMetadata(meta)
  assert.deepEqual(result, { firmName: 'Test Co', currency: 'MYR', personName: 'John Doe' })
})

test('isEarlyAccessFull: returns false when error is null', () => {
  const result = isEarlyAccessFull(null)
  assert.equal(result, false)
})

test('isEarlyAccessFull: returns false when error is not an object', () => {
  const result = isEarlyAccessFull('not an object')
  assert.equal(result, false)
})

test('isEarlyAccessFull: returns false when message is missing', () => {
  const error = { code: 'P0001' }
  const result = isEarlyAccessFull(error)
  assert.equal(result, false)
})

test('isEarlyAccessFull: returns false when message does not contain EARLY_ACCESS_FULL', () => {
  const error = { message: 'Enter your firm name.' }
  const result = isEarlyAccessFull(error)
  assert.equal(result, false)
})

test('isEarlyAccessFull: returns true when message contains EARLY_ACCESS_FULL', () => {
  const error = { message: 'EARLY_ACCESS_FULL' }
  const result = isEarlyAccessFull(error)
  assert.equal(result, true)
})

test('isEarlyAccessFull: returns true when EARLY_ACCESS_FULL is in message text', () => {
  const error = { code: 'P0001', message: 'Something happened: EARLY_ACCESS_FULL' }
  const result = isEarlyAccessFull(error)
  assert.equal(result, true)
})
