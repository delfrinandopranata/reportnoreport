import { useId, type ReactNode } from 'react'
import { FolderCard } from './FolderCard'

/** One headline figure under a folder tab (the label wraps, never truncates). `empty` shows "No data yet" at the same height. Spec: design/components/KpiTile. */
export function KpiTile({ label, value, caption, empty = false, headingId, className = '', children }: {
  label: string; value?: string; caption?: string; empty?: boolean; headingId?: string; className?: string; children?: ReactNode
}) {
  const own = useId()
  return (
    <FolderCard tab={label} headingId={headingId ?? own} className={`rnr-kpi-tile ${className}`.trim()} wrap>
      {value !== undefined && <p className="rnr-kpi-figure rnr-num" data-empty={empty || undefined}>{empty ? 'No data yet' : value}</p>}
      {caption && <p className="rnr-caption">{caption}</p>}
      {children}
    </FolderCard>
  )
}
