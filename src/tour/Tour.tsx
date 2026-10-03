import { useEffect, useId, useRef, useState } from 'react'
import { Icon, btn } from '../ui'
import { calculatePopoverPosition, getSpotlightRect, type Position } from './positioning'

export interface TourStep {
  id: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

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
  const dialogRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useRef<HTMLDivElement>(null)

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
    if (!open || !dialogRef.current) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip()
      }
    }

    // Focus the first button in the dialog
    const firstButton = dialogRef.current.querySelector('button')
    if (firstButton) {
      firstButton.focus()
    }

    const dialog = dialogRef.current
    dialog.addEventListener('keydown', handleKeyDown)

    // Focus trap: keep focus within dialog
    const focusableElements = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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

  if (!open) return null

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <>
      {/* Backdrop with spotlight cutout */}
      <div
        className="fixed inset-0 z-40 bg-zinc-950/50 dark:bg-zinc-950/70"
        onClick={onSkip}
        aria-hidden="true"
        style={{
          WebkitMaskImage: spotlightRect
            ? `radial-gradient(circle at ${spotlightRect.left + spotlightRect.width / 2}px ${spotlightRect.top + spotlightRect.height / 2}px,
               transparent ${Math.max(spotlightRect.width, spotlightRect.height) / 2}px,
               black ${Math.max(spotlightRect.width, spotlightRect.height) / 2 + 20}px)`
            : 'none',
          maskImage: spotlightRect
            ? `radial-gradient(circle at ${spotlightRect.left + spotlightRect.width / 2}px ${spotlightRect.top + spotlightRect.height / 2}px,
               transparent ${Math.max(spotlightRect.width, spotlightRect.height) / 2}px,
               black ${Math.max(spotlightRect.width, spotlightRect.height) / 2 + 20}px)`
            : 'none',
          transition: prefersReducedMotion ? 'none' : 'mask-image 200ms ease-out, webkit-mask-image 200ms ease-out',
        }}
      />

      {/* Popover */}
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
        className={`fixed z-50 w-80 rounded-xl bg-white p-4 shadow-2xl outline-none dark:bg-zinc-900 sm:w-96 ${
          prefersReducedMotion ? '' : 'animate-in fade-in zoom-in-95'
        }`}
        style={{
          top: `${popoverPos.top}px`,
          left: `${popoverPos.left}px`,
          transition: prefersReducedMotion ? 'none' : 'top 200ms ease-out, left 200ms ease-out',
        }}
      >
        {/* Content */}
        <div
          ref={focusTrapRef}
          className="flex flex-col gap-3"
        >
          <div>
            <h2
              id={titleId}
              className="text-base font-semibold text-zinc-900 dark:text-white"
            >
              {step.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {step.description}
            </p>
          </div>

          {/* Step counter */}
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Step {currentIndex + 1} of {totalSteps}
          </div>

          {/* Button group */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={currentIndex === 0}
              aria-label={`Go to previous step${currentIndex === 0 ? ' (disabled)' : ''}`}
              className={`${btn.ghost} flex-1 text-xs sm:text-sm`}
            >
              <Icon name="back" className="size-3 sm:size-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={currentIndex === totalSteps - 1}
              aria-label={`Go to next step${currentIndex === totalSteps - 1 ? ' (disabled)' : ''}`}
              className={`${btn.primary} flex-1 text-xs sm:text-sm`}
            >
              <span className="hidden sm:inline">Next</span>
              <Icon name="right" className="size-3 sm:size-4" />
            </button>

            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip tour"
              className={`${btn.ghost} text-xs sm:text-sm`}
              title="Skip tour (Esc)"
            >
              <Icon name="x" className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
