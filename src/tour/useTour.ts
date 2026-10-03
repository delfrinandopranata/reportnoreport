import { useEffect, useState } from 'react'
import { useSession } from '../data/session'
import { usePreference } from '../data/queries'
import { filterTourStepsByRole } from './steps'
import { shouldAutoStart, type TourState } from './autoStart'

export type { TourState }

export function useTour() {
  const { profile, firm } = useSession()
  const [pref, setPref, loaded] = usePreference<TourState>('tour', { status: 'not_started', step: 0 })
  const [open, setOpen] = useState(false)

  const steps = filterTourStepsByRole(profile.role)
  const currentStep = steps[pref.step]

  // Wait for the stored state: before it loads, the fallback says 'not_started' for everyone.
  useEffect(() => {
    if (loaded && shouldAutoStart(pref, !!firm)) {
      setOpen(true)
    }
  }, [loaded, pref, firm])

  const onNext = () => {
    if (pref.step < steps.length - 1) {
      setPref({ ...pref, step: pref.step + 1, status: 'in_progress' })
    } else {
      setPref({ ...pref, status: 'done' })
      setOpen(false)
    }
  }

  const onPrev = () => {
    if (pref.step > 0) {
      setPref({ ...pref, step: pref.step - 1, status: 'in_progress' })
    }
  }

  const onSkip = () => {
    setPref({ ...pref, status: 'skipped' })
    setOpen(false)
  }

  const replay = () => {
    setPref({ status: 'in_progress', step: 0 })
    setOpen(true)
  }

  return {
    open,
    currentIndex: pref.step,
    steps,
    currentStep,
    onNext,
    onPrev,
    onSkip,
    replay,
  }
}
