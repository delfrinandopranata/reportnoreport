import { useOrg } from '../rbac/useOrg'
import { Skeleton } from '../ui/Skeleton'
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
      <div className="flex flex-col gap-2">
        <p className="rnr-error" role="alert">{e ? e.message : 'We could not load this widget.'}</p>
        {(!e || e.status === null) && <div><button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => void run.refetch()}>Try again</button></div>}
      </div>
    )
  }
  const data = run.data
  const r = data.result
  if (w.kind === 'number' && r.kind === 'groups' && r.total === 0) return <p className="rnr-muted">{EMPTY}</p> // no groups means no records, which is not "No numbers"
  if (w.kind === 'number') {
    const value = r.kind === 'groups' ? r.grandTotal : r.total
    const label = r.kind === 'groups' && data.aggregateFn === 'sum' ? data.aggregateLabel : 'Records'
    return (
      <div className="flex flex-col gap-1">
        <p className="rnr-kpi">{value === null ? 'No numbers' : cellText(value)}</p>
        <p className="rnr-caption">{label}</p>
        {r.kind === 'groups' && r.skipped > 0 && <p className="rnr-caption">{skippedText(r.skipped)}</p>}
      </div>
    )
  }
  if (w.kind === 'table') {
    const shown = r.kind === 'rows' ? r.rows.length : r.groups.length
    const more = shownText(shown, r.total, r.kind === 'rows' ? 'record' : 'group')
    return (
      <div className="flex flex-col gap-2">
        {r.total === 0 ? <p className="rnr-muted">{EMPTY}</p> : <ResultTable data={data} busy={run.isFetching} bare />}
        {more && <p className="rnr-caption">{more}. <a className="underline" href={`#/reports/${w.report_id}`}>Open the report</a></p>}
      </div>
    )
  }
  return <ChartWidget kind={w.kind} title={w.title} data={data} reportId={w.report_id} />
}
