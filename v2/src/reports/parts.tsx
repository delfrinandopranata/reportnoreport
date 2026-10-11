import type { ReactNode } from 'react'
import { XIcon, type IconComponent } from '../ui/icons'

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

/** A sentence that replaces or sits above content because something failed: icon, sentence and tint, never colour alone. */
export function Note({ children }: { children: ReactNode }) {
  return <div className="rnr-note" data-tone="down" role="alert"><XIcon size={20} /><div>{children}</div></div>
}
