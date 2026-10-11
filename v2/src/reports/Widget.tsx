import { useId, type ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { FolderCard } from '../ui/FolderCard'
import { Skeleton } from '../ui/Skeleton'
import { Note } from '../ui/Note'
import { ReportError, useRunReport, type WidgetRow } from './api'
import { MAX_BARS } from './chart'
import { ChartWidget } from './ChartWidget'
import { ResultTable } from './ResultTable'
import { cellText, shownText, skippedText } from './text'

const SIZE = { number: 1, table: 10, bar: MAX_BARS, line: MAX_BARS } as const
const EMPTY = 'No records to show yet.'

/** Runs the widget's report as the viewer, so each person's dashboard counts only the records they can see. */
export function WidgetBody({ w }: { w: WidgetRow }) {
  const { orgId, userId, can } = useOrg()
  const run = useRunReport(orgId, userId, can('reports.manage'), { reportId: w.report_id }, 1, SIZE[w.kind])
  if (run.isPending) return <Skeleton rows={[{ w: '60%', h: 32 }]} />
  if (run.error) {
    const e = run.error instanceof ReportError ? run.error : null
    return (
      <div className="flex flex-col items-start gap-2">
        <Note>{e ? e.message : 'This widget did not load. Try again.'}</Note>
        {(!e || e.status === null) && <button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => void run.refetch()}>Try again</button>}
      </div>
    )
  }
  const data = run.data
  const r = data.result
  if (w.kind === 'number' && r.kind === 'groups' && r.total === 0) return <p className="rnr-kpi-figure" data-empty>{EMPTY}</p> // no groups means no records, which is not "No numbers"
  if (w.kind === 'number') {
    const value = r.kind === 'groups' ? r.grandTotal : r.total
    const label = r.kind === 'groups' && data.aggregateFn === 'sum' ? data.aggregateLabel : 'Records'
    return (
      <>
        <p className="rnr-kpi-figure rnr-num" data-empty={value === null || undefined}>{value === null ? 'No numbers' : cellText(value)}</p>
        <p className="rnr-caption">{label}</p>
        {r.kind === 'groups' && r.skipped > 0 && <p className="rnr-caption">{skippedText(r.skipped)}</p>}
      </>
    )
  }
  if (w.kind === 'table') {
    const shown = r.kind === 'rows' ? r.rows.length : r.groups.length
    const more = shownText(shown, r.total, r.kind === 'rows' ? 'record' : 'group')
    return (
      <div className="flex flex-col gap-2">
        {r.total === 0 ? <p className="rnr-muted">{EMPTY}</p> : <ResultTable data={data} busy={run.isFetching} bare />}
        {more && <p className="rnr-caption">{more}. <a className="rnr-link" href={`#/reports/${w.report_id}`}>Open the report</a></p>}
      </div>
    )
  }
  return <ChartWidget kind={w.kind} title={w.title} data={data} reportId={w.report_id} />
}

/**
 * One dashboard widget. A number is a KPI tile (a folder whose tab is the title, which wraps instead of clipping);
 * everything else is a card with a head. `handle` and `menu` are the edit-mode controls, `link` the "Open report" action.
 * `state` is the Widget README's editing / overlay / placeholder.
 */
export function WidgetCard({ w, state, handle, menu, link, children }: {
  w: WidgetRow; state?: 'editing' | 'overlay' | 'placeholder'; handle?: ReactNode; menu?: ReactNode; link?: boolean; children: ReactNode
}) {
  const id = useId()
  const open = link && (
    <a className="rnr-btn rnr-btn-ghost rnr-btn-sm shrink-0 whitespace-nowrap" href={`#/reports/${w.report_id}`} aria-label={`Open report: ${w.title}`}>Open report</a>
  )
  if (w.kind === 'number') {
    return (
      <div className="rnr-kpi-widget" data-state={state}>
        <FolderCard tab={w.title} headingId={id} className="rnr-kpi-tile" wrap>
          {(handle || menu) && <div className="rnr-widget-bar">{handle}{menu}</div>}
          {children}
          {open}
        </FolderCard>
      </div>
    )
  }
  return (
    <div className="rnr-card flex-1" data-state={state}>
      <header className="rnr-card-head">
        {handle}
        <h2 className="rnr-card-title">{w.title}</h2>
        {open && <span className="ml-auto">{open}</span>}
        {menu}
      </header>
      {children}
    </div>
  )
}
