import type { RunResponse } from './api'
import { cellText, keyText } from './text'

const numeric = (cells: (string | number | null)[]) => cells.some((c) => typeof c === 'number') && cells.every((c) => c === null || typeof c === 'number')

/** Rows or groups, exactly as run-report returned them. The caller states totals and paging. `bare` is for inside a widget card. */
export function ResultTable({ data, busy, bare }: { data: RunResponse; busy: boolean; bare?: boolean }) {
  const r = data.result
  const isSum = data.aggregateFn === 'sum'
  const left = r.kind === 'groups' && r.skipped > 0
  const nums = r.kind === 'rows' ? data.columns.map((_, i) => numeric(r.rows.map((row) => row.cells[i]))) : []
  const body = (
    <table className="rnr-table rnr-sticky-first rnr-results">
      <caption className="sr-only">{data.name}, {data.workflowName}</caption>
      <thead>
        {r.kind === 'rows' ? (
          <tr>{data.columns.map((c, i) => <th key={i} scope="col" className={nums[i] ? 'num' : undefined}>{c}</th>)}</tr>
        ) : (
          <tr>
            <th scope="col">{data.groupLabel}</th>
            <th scope="col" className="num">{data.aggregateLabel}</th>
            {isSum && <th scope="col" className="num">Records</th>}
            {left && <th scope="col" className="num">Left out</th>}
          </tr>
        )}
      </thead>
      <tbody>
        {r.kind === 'rows'
          ? r.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((c, i) => (i === 0
                ? (
                  <th key={i} scope="row" className={nums[0] ? 'num' : undefined}>
                    <a href={`#/records/${row.id}`} aria-label={data.columns[0] === 'Title' ? undefined : `Open record: ${cellText(c)}`}>{cellText(c) || 'Untitled'}</a>
                  </th>
                )
                : <td key={i} className={`rnr-cell${nums[i] ? ' num' : ''}`}>{cellText(c)}</td>))}
            </tr>
          ))
          : r.groups.map((g, i) => (
            <tr key={i}>
              <th scope="row">{keyText(g.key)}</th>
              <td className="num">{isSum ? (g.sum === null ? 'No numbers' : cellText(g.sum)) : cellText(g.count)}</td>
              {isSum && <td className="num">{cellText(g.count)}</td>}
              {left && <td className="num">{g.skipped ? cellText(g.skipped) : ''}</td>}
            </tr>
          ))}
      </tbody>
      {r.kind === 'groups' && (
        <tfoot>
          <tr>
            <th scope="row">All groups</th>
            <td className="num">{r.grandTotal === null ? 'No numbers' : cellText(r.grandTotal)}</td>
            {isSum && <td className="num">{cellText(r.totalRecords)}</td>}
            {left && <td className="num">{cellText(r.skipped)}</td>}
          </tr>
        </tfoot>
      )}
    </table>
  )
  return bare ? <div className="rnr-table-bare" aria-busy={busy}>{body}</div> : <div className="rnr-card rnr-table-card" aria-busy={busy}>{body}</div>
}
