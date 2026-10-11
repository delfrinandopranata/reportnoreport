import type { ReactNode } from 'react'

// A wrapping tab joins the flow instead of floating over the body, so a long label grows the tab (never clips, never overflows).
const WRAP_SECTION = 'flex min-w-0 flex-1 flex-col pt-0'
const WRAP_TAB = 'relative h-auto min-h-[var(--folder-tab-h)] max-w-[calc(100%-var(--folder-shoulder))] self-start whitespace-normal py-2 leading-4 [overflow-wrap:anywhere]'

/** A named section drawn as a folder: the tab grows with its label and never clips. Never nest folders. Spec: design/components/FolderCard. */
export function FolderCard({ tab, headingId, children, className = '', wrap = false }: { tab: ReactNode; headingId?: string; children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <section className={`rnr-folder ${wrap ? WRAP_SECTION : ''} ${className}`.trim()} aria-labelledby={headingId}>
      <span className={`rnr-folder-tab ${wrap ? WRAP_TAB : ''}`.trim()} id={headingId}>{tab}</span>
      <div className={`rnr-folder-body ${wrap ? 'flex-1' : ''}`.trim()}>
        <div className="rnr-perf" aria-hidden="true" />
        {children}
      </div>
    </section>
  )
}
