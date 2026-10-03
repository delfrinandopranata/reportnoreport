import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculatePopoverPosition, getSpotlightRect, type Rect } from './positioning.ts'

// Test viewport: 1024x768
const VIEWPORT_WIDTH = 1024
const VIEWPORT_HEIGHT = 768

// Centered target
const centeredTarget: Rect = {
  top: 300,
  left: 400,
  width: 100,
  height: 50,
}

test('calculatePopoverPosition - bottom placement when there is room', () => {
  const result = calculatePopoverPosition(centeredTarget, 'bottom', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  assert.equal(result.arrowSide, 'bottom')
  // Position should be below target
  assert.ok(result.top > centeredTarget.top + centeredTarget.height)
})

test('calculatePopoverPosition - flips to top when bottom has no room', () => {
  // Target near bottom
  const bottomTarget: Rect = {
    top: 650,
    left: 400,
    width: 100,
    height: 50,
  }
  const result = calculatePopoverPosition(bottomTarget, 'bottom', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  // Should flip to top
  assert.equal(result.arrowSide, 'top')
  assert.ok(result.top < bottomTarget.top)
})

test('calculatePopoverPosition - flips to right when left has no room', () => {
  // Target at left edge
  const leftTarget: Rect = {
    top: 300,
    left: 50,
    width: 100,
    height: 50,
  }
  const result = calculatePopoverPosition(leftTarget, 'left', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  // Should flip to right
  assert.equal(result.arrowSide, 'right')
  assert.ok(result.left > leftTarget.left + leftTarget.width)
})

test('calculatePopoverPosition - clamps to viewport left', () => {
  // Target very far left
  const leftTarget: Rect = {
    top: 300,
    left: 10,
    width: 50,
    height: 50,
  }
  const result = calculatePopoverPosition(leftTarget, 'top', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  // X should be clamped to viewport margin
  assert.ok(result.left >= 8)
})

test('calculatePopoverPosition - clamps to viewport right', () => {
  // Target very far right
  const rightTarget: Rect = {
    top: 300,
    left: 1000,
    width: 50,
    height: 50,
  }
  const result = calculatePopoverPosition(rightTarget, 'top', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  // X + width should be within viewport
  assert.ok(result.left + 320 <= VIEWPORT_WIDTH)
})

test('calculatePopoverPosition - centers horizontally for top/bottom', () => {
  const result = calculatePopoverPosition(centeredTarget, 'bottom', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  // Popover center should be near target center
  const popoverCenterX = result.left + 320 / 2
  const targetCenterX = centeredTarget.left + centeredTarget.width / 2
  assert.ok(Math.abs(popoverCenterX - targetCenterX) < 20) // Allow small margin
})

test('calculatePopoverPosition - centers vertically for left/right', () => {
  const result = calculatePopoverPosition(centeredTarget, 'right', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  // Popover center should be near target center
  const popoverCenterY = result.top + 200 / 2
  const targetCenterY = centeredTarget.top + centeredTarget.height / 2
  assert.ok(Math.abs(popoverCenterY - targetCenterY) < 20) // Allow small margin
})

test('getSpotlightRect - adds padding around target', () => {
  const result = getSpotlightRect(centeredTarget, 8)
  assert.equal(result.top, centeredTarget.top - 8)
  assert.equal(result.left, centeredTarget.left - 8)
  assert.equal(result.width, centeredTarget.width + 16)
  assert.equal(result.height, centeredTarget.height + 16)
})

test('getSpotlightRect - works with custom padding', () => {
  const result = getSpotlightRect(centeredTarget, 16)
  assert.equal(result.top, centeredTarget.top - 16)
  assert.equal(result.left, centeredTarget.left - 16)
  assert.equal(result.width, centeredTarget.width + 32)
  assert.equal(result.height, centeredTarget.height + 32)
})

test('calculatePopoverPosition - top placement preserves horizontal centering', () => {
  const result = calculatePopoverPosition(centeredTarget, 'top', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  assert.equal(result.arrowSide, 'top')
  const popoverCenterX = result.left + 160
  const targetCenterX = centeredTarget.left + 50
  assert.ok(Math.abs(popoverCenterX - targetCenterX) < 20)
})

test('calculatePopoverPosition - left placement when enough room', () => {
  // Target with room on left
  const leftTarget: Rect = {
    top: 300,
    left: 500,
    width: 100,
    height: 50,
  }
  const result = calculatePopoverPosition(leftTarget, 'left', VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  assert.equal(result.arrowSide, 'left')
  assert.ok(result.left < leftTarget.left)
})
