import { useId } from 'react'
import { FolderCard } from './FolderCard'

/** One headline figure under a folder tab: label, mono figure, optional caption. Spec: design/components/KpiTile. */
export function KpiTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  const id = useId()
  return (
    <FolderCard tab={label} headingId={id} className="rnr-kpi-tile">
      <p className="rnr-kpi-figure rnr-num">{value}</p>
      {caption && <p className="rnr-caption">{caption}</p>}
    </FolderCard>
  )
}
