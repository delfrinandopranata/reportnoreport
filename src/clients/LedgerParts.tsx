import type { ReactNode } from 'react'
import { Skeleton } from './shared'

/** Mobile reflow of one table row: heading + prominent figure up top, every other column below as label:value. */
export function MobileCard({ heading, figure, figureLabel, fields, href, negative }: { heading: ReactNode; figure: ReactNode; figureLabel: string; fields: { label: string; value: ReactNode }[]; href?: string; negative?: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{heading}</div>
        <div className="shrink-0 text-right">
          <p className="rnr-muted text-xs">{figureLabel}</p>
          <p className="rnr-amt" data-neg={negative || undefined}>{figure}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-soft pt-2 text-xs">
        {fields.map((f, i) => (
          <div key={i} className="min-w-0">
            <dt className="rnr-muted">{f.label}</dt>
            <dd className="truncate">{f.value || '—'}</dd>
          </div>
        ))}
      </dl>
    </>
  )
  const className = 'rnr-card grid gap-2'
  return href ? <a href={href} className={className}>{body}</a> : <div className={className}>{body}</div>
}

export function LedgerSkeleton() {
  return (
    <div role="status" aria-label="Loading clients" className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rnr-card grid gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-20" /></div>
        ))}
      </div>
      <div className="rnr-card grid gap-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
      <div className="rnr-card grid gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
