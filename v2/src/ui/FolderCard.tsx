import type { ReactNode } from 'react'

/** A named section drawn as a folder: the tab grows with its label and never clips. Never nest folders. Spec: design/components/FolderCard. */
export function FolderCard({ tab, headingId, children, className = '' }: { tab: ReactNode; headingId?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rnr-folder ${className}`.trim()} aria-labelledby={headingId}>
      <span className="rnr-folder-tab" id={headingId}>{tab}</span>
      <div className="rnr-folder-body">
        <div className="rnr-perf" aria-hidden="true" />
        {children}
      </div>
    </section>
  )
}
