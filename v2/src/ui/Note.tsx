import type { ReactNode } from 'react'
import { CheckIcon, StopIcon, WarningCircleIcon, type IconComponent } from './icons'

const ICONS = { down: WarningCircleIcon, warn: StopIcon, ok: CheckIcon }

/** `rnr-note`: tone is the icon, the tint and the sentence, never colour alone. A down note is an alert unless told otherwise. */
export function Note({ tone = 'down', role, children }: { tone?: keyof typeof ICONS; role?: 'alert' | 'status'; children: ReactNode }) {
  const Icon = ICONS[tone]
  return <div className="rnr-note" data-tone={tone} role={role ?? (tone === 'down' ? 'alert' : undefined)}><Icon size={20} /><div>{children}</div></div>
}

/** An inline field error: icon + sentence. */
export function FieldError({ id, role, children }: { id?: string; role?: 'alert'; children: ReactNode }) {
  return <p id={id} className="rnr-error" role={role}><WarningCircleIcon />{children}</p>
}

/** Empty state, one kind per screen state: first run, no results, filtered out or error. Spec: design/components/EmptyState. */
export function Empty({ icon: Icon, title, children, action, alert }: { icon: IconComponent; title: string; children: ReactNode; action?: ReactNode; alert?: boolean }) {
  return (
    <div className="rnr-empty" role={alert ? 'alert' : undefined}>
      <span className="rnr-kind" aria-hidden="true"><Icon size={24} /></span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}

/** The empty-state error kind: "<Thing> did not load", one sentence, one action. */
export function LoadError({ what, onRetry }: { what: string; onRetry(): void }) {
  return (
    <Empty icon={WarningCircleIcon} title={`${what} did not load`} alert
      action={<button type="button" className="rnr-btn rnr-btn-secondary" onClick={onRetry}>Try again</button>}>
      Check your connection, then try again.
    </Empty>
  )
}
