import { Skeleton } from '../ui/Skeleton'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { useCampaign } from './api'
import { CampaignEditor } from './CampaignEditor'
import { CampaignReport } from './CampaignReport'

/** Drafts, scheduled and failed campaigns open the editor; once sending starts the page is the report. */
export function CampaignPage({ id }: { id: string }) {
  const c = useCampaign(id)
  // Both live above the editor and the report, which swap when the status changes, so focus and the announcement survive (QA-8).
  const focusLater = useFocusAfterRender()
  const [notice, setNotice] = useNotice()
  if (c.isPending) return <Skeleton rows={[{ w: '40%', h: 32 }, { w: '100%', h: 320 }]} />
  if (c.isError) {
    return (
      <div className="rnr-card gap-3">
        <p role="alert">This campaign did not load. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void c.refetch()}>Try again</button></div>
      </div>
    )
  }
  if (!c.data) {
    return (
      <div className="rnr-card gap-3">
        <h1 className="page-title">This campaign does not exist</h1>
        <p className="rnr-muted">It may have been deleted, or it belongs to another organisation.</p>
        <div><a className="rnr-btn rnr-btn-secondary" href="#/campaigns">Go to campaigns</a></div>
      </div>
    )
  }
  const live = <p className="sr-only" role="status">{notice}</p>
  const shared = { notice, setNotice }
  return c.data.status === 'sending' || c.data.status === 'sent'
    ? <>{live}<CampaignReport campaign={c.data} {...shared} /></>
    : <>{live}<CampaignEditor key={c.data.updated_at} campaign={c.data} {...shared} onMoved={() => focusLater('campaign-h')} /></>
}
