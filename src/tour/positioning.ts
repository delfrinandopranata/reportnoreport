/**
 * Positioning logic for the tour popover.
 * Determines where to place the popover relative to a target element,
 * with viewport-aware placement flipping and clamping.
 */

export type Position = 'top' | 'bottom' | 'left' | 'right'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface PopoverPosition {
  top: number
  left: number
  arrowSide: Position
}

const POPOVER_WIDTH = 320 // must match the popover's w-80 in Tour.tsx
const POPOVER_HEIGHT = 200 // approximate, varies by content
const OFFSET = 16 // gap between target and popover
const VIEWPORT_MARGIN = 8 // minimum margin from viewport edge

/**
 * Calculate the position of a popover relative to a target element.
 * Flips placement when there's not enough room and clamps to viewport.
 */
export function calculatePopoverPosition(
  targetRect: Rect,
  requestedPosition: Position,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1024,
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 768,
): PopoverPosition {
  // Try the requested position first
  let position = requestedPosition
  let x = 0
  let y = 0

  // Calculate position for each side
  const positions = {
    top: () => {
      const centerX = targetRect.left + targetRect.width / 2
      const topY = targetRect.top - OFFSET - POPOVER_HEIGHT
      return { x: centerX, y: topY, fits: topY >= VIEWPORT_MARGIN }
    },
    bottom: () => {
      const centerX = targetRect.left + targetRect.width / 2
      const bottomY = targetRect.top + targetRect.height + OFFSET
      return {
        x: centerX,
        y: bottomY,
        fits: bottomY + POPOVER_HEIGHT <= viewportHeight - VIEWPORT_MARGIN,
      }
    },
    left: () => {
      const leftX = targetRect.left - OFFSET - POPOVER_WIDTH
      const centerY = targetRect.top + targetRect.height / 2
      return { x: leftX, y: centerY, fits: leftX >= VIEWPORT_MARGIN }
    },
    right: () => {
      const rightX = targetRect.left + targetRect.width + OFFSET
      const centerY = targetRect.top + targetRect.height / 2
      return {
        x: rightX,
        y: centerY,
        fits: rightX + POPOVER_WIDTH <= viewportWidth - VIEWPORT_MARGIN,
      }
    },
  }

  const preferred = positions[position]()

  // If preferred position doesn't fit, try alternatives in smart order
  if (!preferred.fits) {
    // Try the opposite side first, then others
    const flipMap: Record<Position, Position> = {
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
    }
    const opposite = flipMap[position]

    // Build alternatives in order: opposite first, then others
    const alternatives: Array<{ side: Position; x: number; y: number; fits: boolean }> = []
    const oppResult = { side: opposite, ...positions[opposite]() }
    alternatives.push(oppResult)

    for (const [alt, fn] of Object.entries(positions)) {
      if (alt !== position && alt !== opposite) {
        alternatives.push({ side: alt as Position, ...fn() })
      }
    }

    const fitted = alternatives.find((p) => p.fits)
    if (fitted) {
      position = fitted.side
      x = fitted.x
      y = fitted.y
    } else {
      // No side fits; use preferred anyway but clamp to viewport
      x = preferred.x
      y = preferred.y
    }
  } else {
    x = preferred.x
    y = preferred.y
  }

  // Convert coordinates to popover top-left based on position
  let topLeft = { top: 0, left: 0 }

  if (position === 'left' || position === 'right') {
    // For left/right: x is already the desired popover left/right edge
    // y is the center point
    topLeft.top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(y - POPOVER_HEIGHT / 2, viewportHeight - POPOVER_HEIGHT - VIEWPORT_MARGIN),
    )
    topLeft.left = Math.max(VIEWPORT_MARGIN, Math.min(x, viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN))
  } else {
    // For top/bottom: x is the center point
    // y is already the desired popover top/bottom edge
    topLeft.top = Math.max(VIEWPORT_MARGIN, Math.min(y, viewportHeight - POPOVER_HEIGHT - VIEWPORT_MARGIN))
    topLeft.left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(x - POPOVER_WIDTH / 2, viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
    )
  }

  return {
    top: topLeft.top,
    left: topLeft.left,
    arrowSide: position,
  }
}

/**
 * Get the spotlight cutout coordinates relative to the viewport.
 * Returns a circle (or rect for accessibility) around the target.
 */
export function getSpotlightRect(targetRect: Rect, padding = 8): Rect {
  return {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  }
}
