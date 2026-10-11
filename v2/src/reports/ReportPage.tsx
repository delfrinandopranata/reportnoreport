import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useForms } from '../forms/api'
import { RuleEditor } from '../forms/builder/RuleEditor'
import type { Field, Rule } from '../forms/logic'
import { useWorkflow } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon, DownIcon, DownloadIcon, PencilIcon, TrashIcon, UpIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { useMedia } from '../ui/useMedia'
import { useMenu } from '../ui/useMenu'
import { useNotice } from '../ui/useNotice'
import {
  MAX_COLUMNS, MAX_FILTERS, META_KEYS, META_LABELS, columnId, columnLabel, csvFilename, dataColumns, filterScope, readColumn, readReportDef, stepFields,
  type Column, type DataColumn,
} from './logic'
import { ReportError, downloadCsv, updateReport, useReport, useRunReport, type ReportFields, type RunBody, type SavedReport } from './api'
import { ResultTable } from './ResultTable'
import { lastPage, pageText, skippedText, totalsText } from './text'

export function ReportPage({ id }: { id: string }) {
  const report = useReport(id)
  const [generation, setGeneration] = useState(0)
  if (report.isPending) return <Skeleton rows={[{ w: '40%', h: 32 }, { w: '100%', h: 320 }]} />
  if (report.isError) {
    return (
      <div className="rnr-card gap-3 max-w-xl">
        <p role="alert">We could not load this report. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void report.refetch()}>Try again</button></div>
      </div>
    )
  }
  if (!report.data) return <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">This report does not exist</h1><p className="rnr-muted">It may have been deleted.</p></div>
  return <ReportView key={generation} saved={report.data} onReload={async () => { await report.refetch(); setGeneration((g) => g + 1) }} />
}

const fieldsOf = (r: SavedReport): ReportFields => ({ name: r.name, columns: r.columns, filters: r.filters, group_by: r.group_by, aggregate: r.aggregate })
const parseColumn = (v: string) => readColumn(v.startsWith('meta:') ? { meta: v.slice(5) } : { field: v.slice(6) })

function ReportView({ saved, onReload }: { saved: SavedReport; onReload(): Promise<void> }) {
  const { orgId, userId, can } = useOrg()
  const manage = can('reports.manage')
  const qc = useQueryClient()
  const uid = useId()
  const wf = useWorkflow(saved.workflow_id)
  const forms = useForms(orgId)
  const wide = useMedia('(min-width: 1024px)')
  const [f, setF] = useState<ReportFields>(fieldsOf(saved))
  const [base, setBase] = useState<ReportFields>(fieldsOf(saved))
  const [version, setVersion] = useState(saved.updated_at)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [panelOpen, setPanelOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const save = useAction()
  const csv = useAction()
  const reloading = useAction()
  const form = useRef<HTMLFormElement>(null)
  const focusLater = useFocusAfterRender()
  const dirty = JSON.stringify(f) !== JSON.stringify(base)
  const guard = useLeaveGuard(dirty, `#/reports/${saved.id}`)

  const steps = useMemo(() => (wf.data && forms.data ? stepFields(wf.data.graph, new Map(forms.data.map((x) => [x.id, x.schema as Field[]]))) : []), [wf.data, forms.data])
  const cols = useMemo(() => dataColumns(steps), [steps])
  const scope = useMemo(() => filterScope(steps), [steps])
  const numbers = cols.filter((c) => c.type === 'number' || c.type === 'calculated')
  const check = readReportDef(f)
  // Unsaved edits preview straight away; a saved, unchanged report runs by id like everyone else's.
  const body: RunBody | null = !dirty ? { reportId: saved.id } : check.ok ? { workflowId: saved.workflow_id, definition: { columns: f.columns, filters: f.filters, group_by: f.group_by, aggregate: f.aggregate } } : null
  const run = useRunReport(orgId, userId, manage, body, page, pageSize)
  const edit = (patch: Partial<ReportFields>) => { setF((x) => ({ ...x, ...patch })); setPage(1) }
  const r = run.data?.result
  if (r && page > lastPage(pageSize, r.total)) setPage(lastPage(pageSize, r.total)) // the total shrank under us
  const fail = (msg: string, focus?: string) => {
    setError(msg)
    setPanelOpen(true)
    if (focus) focusLater(focus)
    return false as const
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save.run(async () => {
      setError(null)
      if (!f.name.trim()) return fail('Enter a name for the report.', `${uid}-name`)
      if (!check.ok) return fail(check.error)
      const { data, error: e2 } = await updateReport(saved.id, { ...f, name: f.name.trim() }, version)
      if (e2) return fail(friendlyError(e2))
      if (!data.length) { setConflict(true); setPanelOpen(true); return false }
      setVersion(data[0].updated_at)
      setBase(f)
      setNotice('Report saved.')
      void qc.invalidateQueries({ queryKey: ['reports', orgId] })
    }, true)
  }
  const exportCsv = () => {
    setCsvError(null)
    if (!body) { setCsvError('Finish the report settings before downloading.'); setPanelOpen(true); return }
    void csv.run(async () => {
      const out = await downloadCsv(orgId!, manage, body, f.name)
      if ('error' in out) setCsvError(out.error)
      else setNotice(`Downloaded ${out.filename}.`)
    })
  }

  const failed = run.error instanceof ReportError ? run.error : run.error ? new ReportError('We could not run this report. Try again.', null) : null
  const filename = csvFilename(f.name, today)
  const announce = r ? `${totalsText(r)}. ${r.kind === 'groups' ? skippedText(r.skipped) : ''}` : ''
  const noDraft = !check.ok && dirty
  const settings = manage ? (
    <form ref={form} className="flex flex-col gap-4" onSubmit={submit} noValidate aria-label="Report settings">
      <div className="rnr-field" data-invalid={error?.startsWith('Enter a name') || undefined}>
        <label className="rnr-label" htmlFor={`${uid}-name`}>Name</label>
        <input id={`${uid}-name`} className="rnr-input" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <ColumnList columns={f.columns} cols={cols} onChange={(columns) => edit({ columns })} onNote={setNotice} />
      <FilterList filters={f.filters} scope={scope} onChange={(filters) => edit({ filters })} />
      <div className="rnr-field">
        <label className="rnr-label" htmlFor={`${uid}-g`}>Group by</label>
        <select id={`${uid}-g`} className="rnr-input" value={f.group_by ? columnId(f.group_by) : ''}
          onChange={(e) => {
            const g = e.target.value ? parseColumn(e.target.value) : null
            edit({ group_by: g, aggregate: g ? f.aggregate ?? { fn: 'count' } : null })
          }}>
          <option value="">No grouping</option>
          <optgroup label="Record">{META_KEYS.map((k) => <option key={k} value={`meta:${k}`}>{META_LABELS[k]}</option>)}</optgroup>
          <optgroup label="Answers">{cols.map((c) => <option key={c.path} value={`field:${c.path}`}>{c.label}</option>)}</optgroup>
        </select>
      </div>
      {f.group_by && (
        <fieldset className="rnr-field">
          <legend className="rnr-fieldset-label">For each group</legend>
          <div className="rnr-seg self-start" role="group" aria-label="For each group">
            <button type="button" aria-pressed={f.aggregate?.fn !== 'sum'} onClick={() => edit({ aggregate: { fn: 'count' } })}>Count records</button>
            <button type="button" aria-pressed={f.aggregate?.fn === 'sum'} aria-disabled={numbers.length === 0 || undefined} aria-describedby={numbers.length === 0 ? `${uid}-nonum` : undefined}
              onClick={() => numbers[0] && edit({ aggregate: { fn: 'sum', field: numbers[0].path } })}>Add up a number</button>
          </div>
          {numbers.length === 0 && <p id={`${uid}-nonum`} className="rnr-caption">This workflow's forms have no number fields to add up.</p>}
          {f.aggregate?.fn === 'sum' && (
            <div className="rnr-field">
              <label className="rnr-label" htmlFor={`${uid}-sum`}>Number to add up</label>
              <select id={`${uid}-sum`} className="rnr-input" value={f.aggregate.field} onChange={(e) => edit({ aggregate: { fn: 'sum', field: e.target.value } })}>
                {numbers.map((c) => <option key={c.path} value={c.path}>{c.label}</option>)}
              </select>
            </div>
          )}
        </fieldset>
      )}
      {error && <p className="rnr-error" role="alert">{error}</p>}
      {conflict && (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="rnr-error">This report was changed by someone else. Reload to see their changes.</p>
          <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={reloading.busy} onClick={() => void reloading.run(onReload)}>
            {reloading.busy && <span className="rnr-spin" aria-hidden="true" />}{reloading.busy ? 'Reloading…' : 'Reload report'}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="rnr-btn rnr-btn-primary" aria-busy={save.busy}>
          {save.busy && <span className="rnr-spin" aria-hidden="true" />}
          {save.saved && !save.busy && <span className="rnr-pop" aria-hidden="true"><CheckIcon /></span>}
          {save.busy ? 'Saving…' : save.saved ? 'Saved' : 'Save report'}
        </button>
        {dirty && <span className="rnr-status"><PencilIcon size={14} />Unsaved changes. The results already show them.</span>}
      </div>
    </form>
  ) : (
    <div className="flex flex-col gap-2">
      <h2 className="dialog-title">About this report</h2>
      <p className="rnr-muted">Columns: {f.columns.map((c) => columnLabel(c, cols)).join(', ')}</p>
      <p className="rnr-muted">{f.filters.length ? `${f.filters.length} ${f.filters.length === 1 ? 'filter' : 'filters'}` : 'No filters'}{f.group_by ? `. Grouped by ${columnLabel(f.group_by, cols)}` : ''}</p>
    </div>
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${uid}-h`}>
      <div className="flex flex-col gap-1">
        <a className="rnr-btn rnr-btn-ghost self-start" href="#/reports"><BackIcon />Back to reports</a>
        <h1 id={`${uid}-h`} className="page-title" tabIndex={-1}>{base.name}</h1>
        <p className="rnr-muted">
          Records of {wf.data && manage ? <a className="underline" href={`#/workflows/${wf.data.id}/report`}>{wf.data.name}</a> : wf.data?.name ?? 'this workflow'} that you can see.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <details className="rnr-card min-w-0 lg:self-start" open={wide || panelOpen} onToggle={(e) => setPanelOpen(e.currentTarget.open)}>
          <summary className="label rnr-focus lg:hidden">Report settings</summary>
          <div className="pt-3 lg:pt-0">{settings}</div>
        </details>
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="label">{r ? totalsText(r) : ''}</p>
            <button type="button" className="rnr-btn rnr-btn-secondary ml-auto" aria-busy={csv.busy} onClick={exportCsv}>
              {csv.busy ? <span className="rnr-spin" aria-hidden="true" /> : <DownloadIcon />}{csv.busy ? 'Preparing CSV…' : 'Download CSV'}
            </button>
          </div>
          {r?.kind === 'groups' && r.skipped > 0 && <p>{skippedText(r.skipped)}</p>}
          <p className="rnr-caption">Saves every row as {filename}, not just this page.{dirty ? ' It includes your unsaved changes.' : ''}</p>
          {csvError && <p className="rnr-error" role="alert">{csvError}</p>}
          <p className="rnr-caption" role="status">{notice}</p>
          <p className="sr-only" role="status" aria-live="polite">{announce}</p>
          {noDraft && <div className="rnr-card"><p className="rnr-muted">Finish the settings to see results. {check.ok ? '' : check.error}</p></div>}
          {run.isPending && body && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
          {failed?.status === 413 && (
            <div className="rnr-card gap-2"><h2 className="dialog-title">Too many records for one report</h2><p className="rnr-muted">{failed.message}</p></div>
          )}
          {failed && failed.status !== 413 && (
            <div className="rnr-card gap-3">
              <p role="alert">{failed.message}</p>
              {failed.status === null && <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void run.refetch()}>Try again</button></div>}
            </div>
          )}
          {run.data && r && r.total === 0 && (
            <div className="rnr-card gap-2">
              {r.totalRecords === 0 && f.filters.length === 0
                ? <><h2 className="dialog-title">No records to show yet</h2><p className="rnr-muted">Records of {run.data.workflowName} that you can see appear here once people start it.</p></>
                : <><h2 className="dialog-title">No records match these filters</h2><p className="rnr-muted">Remove or change a filter to see more.</p></>}
            </div>
          )}
          {run.data && r && r.total > 0 && (
            <>
              <ResultTable data={run.data} busy={run.isPlaceholderData || run.isFetching} />
              <nav className="rnr-pager" aria-label="Results pages">
                <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page <= 1 || undefined} onClick={() => page > 1 && setPage(page - 1)}>Previous</button>
                <span className="rnr-num" aria-live="polite">{pageText(page, pageSize, r.total)}</span>
                <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page >= lastPage(pageSize, r.total) || undefined} onClick={() => page < lastPage(pageSize, r.total) && setPage(page + 1)}>Next</button>
                {run.isFetching && <span className="rnr-spin" aria-hidden="true" />}
                <label className="rnr-pager-size">Per page
                  <select className="rnr-input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                    {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </nav>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body={`Your changes to ${f.name.trim() || 'this report'} will be lost.`}
        confirmLabel="Leave" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}

function FilterList({ filters, scope, onChange }: { filters: Rule[]; scope: Field[]; onChange(next: Rule[]): void }) {
  const list = useRef<HTMLFieldSetElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const focusLater = useFocusAfterRender()
  const fieldSelect = (i: number) => list.current?.querySelector<HTMLElement>(`[data-key="filter-${i}"] select`)
  const remove = (i: number) => {
    onChange(filters.filter((_, j) => j !== i))
    focusLater(() => (filters.length > 1 ? fieldSelect(i < filters.length - 1 ? i : i - 1) : addButton.current))
  }
  return (
    <fieldset ref={list} className="rnr-field">
      <legend className="rnr-fieldset-label">Filters</legend>
      {filters.length === 0 && <p className="rnr-caption">Every record is included.</p>}
      {filters.length > 1 && <p className="rnr-caption">Records must match every filter.</p>}
      {filters.map((rule, i) => (
        <div key={i} className="rnr-filter" data-key={`filter-${i}`}>
          <RuleEditor rule={rule} scope={scope} self="" required legend={`Filter ${i + 1}`}
            onChange={(next?: Rule) => next && onChange(filters.map((x, j) => (j === i ? next : x)))} />
          <button type="button" className="rnr-btn rnr-btn-ghost self-start" onClick={() => remove(i)}><TrashIcon />Remove filter {i + 1}</button>
        </div>
      ))}
      {filters.length >= MAX_FILTERS
        ? <p className="rnr-caption">A report can have {MAX_FILTERS} filters.</p>
        : scope.length > 0 && (
          <button ref={addButton} type="button" className="rnr-btn rnr-btn-secondary self-start"
            onClick={() => { onChange([...filters, { field: scope[0].key, operator: 'is_not_empty' }]); focusLater(() => fieldSelect(filters.length)) }}>Add filter</button>
        )}
    </fieldset>
  )
}

function ColumnList({ columns, cols, onChange, onNote }: { columns: Column[]; cols: DataColumn[]; onChange(next: Column[]): void; onNote(text: string): void }) {
  const list = useRef<HTMLOListElement>(null)
  const focusLater = useFocusAfterRender()
  const used = new Set(columns.map(columnId))
  const meta = META_KEYS.filter((k) => !used.has(`meta:${k}`))
  const answers = cols.filter((c) => !used.has(`field:${c.path}`))
  const { open: menuOpen, box: menuBox, button: addButton, close: closeMenu, toggle: toggleMenu, onMenuKey, onButtonKey, slot } = useMenu()
  const full = columns.length >= MAX_COLUMNS
  const ctl = (key: string, c: 'up' | 'down' | 'remove') => () => list.current?.querySelector<HTMLElement>(`[data-key="${key}"] [data-ctl="${c}"]`)
  const move = (i: number, by: -1 | 1, c: 'up' | 'down') => {
    const label = columnLabel(columns[i], cols)
    const j = i + by
    if (j < 0 || j >= columns.length) { onNote(`${label} is already ${by < 0 ? 'first' : 'last'}.`); return }
    const next = [...columns]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
    onNote(`${label} moved to position ${j + 1} of ${columns.length}.`)
    focusLater(ctl(columnId(columns[i]), c)) // React re-parents the moved row, so focus goes back to the control that was used
  }
  const remove = (i: number) => {
    onChange(columns.filter((_, j) => j !== i))
    onNote(`${columnLabel(columns[i], cols)} removed. ${columns.length - 1} ${columns.length === 2 ? 'column' : 'columns'} left.`)
    const neighbour = columns[i + 1] ?? columns[i - 1]
    focusLater(neighbour ? ctl(columnId(neighbour), 'remove') : () => addButton.current)
  }
  const add = (c: Column) => {
    closeMenu()
    onChange([...columns, c])
    onNote(`${columnLabel(c, cols)} added as column ${columns.length + 1}.`)
  }
  let n = 0
  return (
    <fieldset className="rnr-field">
      <legend className="rnr-fieldset-label">Columns</legend>
      <ol ref={list} className="rnr-order">
        {columns.map((c, i) => {
          const label = columnLabel(c, cols)
          const key = columnId(c)
          return (
            <li key={key} data-key={key}>
              <span className="rnr-order-label">{label}</span>
              <button type="button" className="rnr-icon-btn" data-ctl="up" aria-label={`Move ${label} up`} aria-disabled={i === 0 || undefined} onClick={() => move(i, -1, 'up')}><UpIcon size={14} /></button>
              <button type="button" className="rnr-icon-btn" data-ctl="down" aria-label={`Move ${label} down`} aria-disabled={i === columns.length - 1 || undefined} onClick={() => move(i, 1, 'down')}><DownIcon size={14} /></button>
              <button type="button" className="rnr-icon-btn" data-ctl="remove" aria-label={`Remove ${label}`} onClick={() => remove(i)}><TrashIcon size={14} /></button>
            </li>
          )
        })}
      </ol>
      <div ref={menuBox} className="rnr-menu-anchor self-start">
        <button ref={addButton} type="button" className="rnr-btn rnr-btn-secondary" aria-haspopup="menu" aria-expanded={menuOpen}
          aria-disabled={full || undefined} onClick={full ? undefined : toggleMenu} onKeyDown={full ? undefined : onButtonKey}>Add column</button>
        {menuOpen && !full && (
          <div role="menu" aria-label="Add column" className="rnr-menu rnr-menu--wide absolute z-20 mt-1" onKeyDown={onMenuKey}>
            <div role="group" aria-label="Record">
              {meta.map((k) => <button key={k} type="button" role="menuitem" {...slot(n++)} className="rnr-menu-item" onClick={() => add({ meta: k })}>{META_LABELS[k]}</button>)}
            </div>
            {answers.length > 0 && <div className="rnr-menu-sep" role="separator" />}
            <div role="group" aria-label="Answers">
              {answers.map((c) => <button key={c.path} type="button" role="menuitem" {...slot(n++)} className="rnr-menu-item" onClick={() => add({ field: c.path })}>{c.label}</button>)}
            </div>
          </div>
        )}
      </div>
      {full && <p className="rnr-caption">A report can have {MAX_COLUMNS} columns.</p>}
    </fieldset>
  )
}
