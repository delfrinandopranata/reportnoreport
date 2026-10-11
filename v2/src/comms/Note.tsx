import type { ReactNode } from 'react'
import { CheckIcon, StopIcon, XIcon } from '../ui/icons'

const ICONS = { down: XIcon, warn: StopIcon, ok: CheckIcon }

/** `rnr-note`: tone is the icon, the tint and the sentence, never colour alone. Errors pass role="alert". */
export function Note({ tone = 'down', role, children }: { tone?: keyof typeof ICONS; role?: 'alert' | 'status'; children: ReactNode }) {
  const Icon = ICONS[tone]
  return <div className="rnr-note" data-tone={tone} role={role}><Icon size={20} /><div>{children}</div></div>
}

/** An inline field error: icon + sentence. */
export function FieldError({ id, role, children }: { id?: string; role?: 'alert'; children: ReactNode }) {
  return <p id={id} className="rnr-error" role={role}><XIcon />{children}</p>
}

/** The empty-state error kind: heading, one sentence, one action. */
export function LoadError({ what, onRetry }: { what: string; onRetry(): void }) {
  return (
    <div className="rnr-empty" role="alert">
      <h2>{what} did not load</h2>
      <p>Check your connection, then try again.</p>
      <button type="button" className="rnr-btn rnr-btn-secondary" onClick={onRetry}>Try again</button>
    </div>
  )
}
