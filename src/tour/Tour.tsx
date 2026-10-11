import { useEffect, useId, useRef, useState } from 'react'
import { Icon, btn } from '../ui'
import { calculatePopoverPosition, getSpotlightRect, type Position } from './positioning'

export interface TourStep {
  id: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

/** The popover's arrow sits on the side facing the target, opposite the side of the target the popover is on. */
const ARROW_SIDE: Record<Position, Position> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

export interface TourProps {
  open: boolean
  step: TourStep
  currentIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

/**
 * In-house tour component with spotlight and popover.
 * Features:
 * - Keyboard support: Esc to close, focus trapped in popover
 * - Accessible: role="dialog", aria-labelledby, proper button semantics
 * - Spotlight: animated cut-out that follows target on scroll/resize
 * - Responsive: works at 375px and larger
 * - Respects prefers-reduced-motion
 * - High contrast: ≥4.5:1 ratio in light and dark
 */
export function Tour({ open, step, currentIndex, totalSteps, onNext, onPrev, onSkip }: TourProps) {
  const dialogId = useId()
  const titleId = useId()
  const bodyId = useId()
  const spotRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; arrowSide: Position }>({
    top: 0,
    left: 0,
    arrowSide: 'bottom',
  })
  const [spotlightRect, setSpotlightRect] = useState<ReturnType<typeof getSpotlightRect> | null>(null)

  // Update positions when target element moves or viewport changes
  useEffect(() => {
    if (!open) return

    const updatePositions = () => {
      const target = document.querySelector(`[data-tour="${step.id}"]`) as HTMLElement | null
      if (!target) {
        // Center the popover if target is missing
        setPopoverPos({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2 - 160,
          arrowSide: 'bottom',
        })
        setSpotlightRect(null)
        return
      }

      const rect = target.getBoundingClientRect()
      const targetRect = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      }

      const pos = calculatePopoverPosition(
        targetRect,
        step.position || 'bottom',
        window.innerWidth,
        window.innerHeight,
      )

      setPopoverPos({
        top: pos.top,
        left: pos.left,
        arrowSide: pos.arrowSide,
      })

      setSpotlightRect(getSpotlightRect(targetRect, 8))
    }

    updatePositions()

    // Listen for scroll and resize
    const handleScroll = updatePositions
    const handleResize = updatePositions

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, step.id, step.position])

  // Keyboard handling and focus management
  useEffect(() => {
    if (!open) {
      // Restore focus when closing
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus()
      }
      return
    }

    if (!dialogRef.current) return

    // Save the previously focused element when opening
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip()
      }
    }

    // Focus the first button in the dialog
    const firstButton = dialogRef.current.querySelector<HTMLElement>('button:not(:disabled)')
    if (firstButton) {
      firstButton.focus()
    }

    const dialog = dialogRef.current
    dialog.addEventListener('keydown', handleKeyDown)

    // Focus trap: keep focus within dialog
    const focusableElements = dialog.querySelectorAll(
      'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    dialog.addEventListener('keydown', handleTabKey)

    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      dialog.removeEventListener('keydown', handleTabKey)
    }
  }, [open, onSkip])

  // shortcut: top/left are viewport coordinates measured at run time, so they cannot be static classes;
  // they go in as CSS custom properties (the only inline values here), the rest is .rnr-coach / .rnr-coach-spot.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    dialog.style.setProperty('--coach-top', `${popoverPos.top}px`)
    dialog.style.setProperty('--coach-left', `${popoverPos.left}px`)
    const spot = spotRef.current
    if (!spot || !spotlightRect) return
    spot.style.setProperty('--spot-top', `${spotlightRect.top}px`)
    spot.style.setProperty('--spot-left', `${spotlightRect.left}px`)
    spot.style.setProperty('--spot-width', `${spotlightRect.width}px`)
    spot.style.setProperty('--spot-height', `${spotlightRect.height}px`)
  }, [open, popoverPos, spotlightRect])

  if (!open) return null

  return (
    <>
      {/* Click-away layer; the spotlight draws the scrim round the target, or this does when there is none. */}
      <div className={`fixed inset-0 z-(--z-tip) ${spotlightRect ? '' : 'bg-(--scrim)'}`} onClick={onSkip} aria-hidden="true" />
      {spotlightRect && <div ref={spotRef} className="rnr-coach-spot" aria-hidden="true" />}

      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
        aria-describedby={bodyId}
        className="rnr-coach"
        data-arrow={spotlightRect ? ARROW_SIDE[popoverPos.arrowSide] : undefined}
      >
        <div ref={focusTrapRef}>
          <p className="rnr-micro rnr-coach-count">{currentIndex + 1} of {totalSteps}</p>
          <h2 id={titleId}>{step.title}</h2>
          <p id={bodyId}>{step.description}</p>

          <div className="rnr-coach-actions">
            <button type="button" onClick={onPrev} disabled={currentIndex === 0} className={btn.ghost}>
              <Icon name="back" className="size-3.5" />
              Back
            </button>
            <button type="button" onClick={onSkip} className={btn.ghost} title="Skip tour (Esc)">
              Skip tour
            </button>
            {/* The last step finishes the tour (recorded as done), so it is never disabled. */}
            <button type="button" onClick={onNext} className={btn.primary}>
              {currentIndex === totalSteps - 1 ? 'Done' : <>Next <Icon name="right" className="size-3.5" /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
