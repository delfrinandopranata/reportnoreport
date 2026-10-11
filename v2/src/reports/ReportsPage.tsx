import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useWorkflows } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { NAV_ICONS, PlusIcon, WarningCircleIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { Day } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { Empty, FieldError } from '../ui/Note'
import { createReport, deleteReport, useReports, useWidgets, type ReportListRow } from './api'
import { PageHead } from '../ui/PageHead'

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export function ReportsPage() {
  const { orgId, orgs, can } = useOrg()
  const manage = can('reports.manage')
  const reports = useReports(orgId)
  const widgets = useWidgets(orgId)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [doomed, setDoomed] = useState<ReportListRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const removal = useAction()
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  // null while the widget list is loading or failed: the count is then unknown, and the dialog says so.
  const usedBy = (id: string) => (widgets.data ? widgets.data.rows.filter((w) => w.report_id === id).length : null)

  useEffect(() => {
    if (!manage) return
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      setCreating(true)
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [manage])

  const confirmDelete = () => removal.run(async () => {
    if (!doomed) return
    const { data, error } = await deleteReport(doomed.id)
    if (error || !data.length) { setDeleteError(error ? friendlyError(error) : 'This report was already deleted, or you no longer manage reports. Reload to see the latest list.'); return }
    setDoomed(null)
    setNotice(`${doomed.name} deleted.`)
    await Promise.all([qc.invalidateQueries({ queryKey: ['reports', orgId] }), qc.invalidateQueries({ queryKey: ['widgets', orgId] })])
    focusLater('reports-h') // the row that held the Delete button is gone
  })

  const firstRun = reports.data?.length === 0
  const used = doomed ? usedBy(doomed.id) : null
  const deleteBody = !doomed ? ''
    : used === null ? `Any dashboard widgets that show this report will be removed too. ${doomed.name} will be deleted for everyone and cannot be recovered.`
    : used > 0 ? `${used} dashboard ${used === 1 ? 'widget shows' : 'widgets show'} this report and will be removed too. ${doomed.name} will be deleted for everyone and cannot be recovered.`
    : `${doomed.name} will be deleted for everyone and cannot be recovered. Records are not changed.`
  return (
    <section className="flex flex-col gap-4" aria-labelledby="reports-h">
      <PageHead id="reports-h" crumb="Work" title="Reports">
        {manage && !!reports.data?.length && (
          <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => setCreating(true)}><PlusIcon />New report<kbd className="rnr-kbd" aria-hidden="true">N</kbd></button>
        )}
      </PageHead>
      <p className="rnr-caption" role="status">{notice}</p>
      {reports.isPending && <Skeleton rows={[{ w: '100%', h: 200 }]} />}
      {reports.isError && (
        <Empty icon={WarningCircleIcon} title="Reports did not load" alert
          action={<button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void reports.refetch()}>Try again</button>}>Check your connection, then try again.</Empty>
      )}
      {firstRun && manage && (
        <Empty icon={NAV_ICONS.reports} title="Build your first report"
          action={<button type="button" className="rnr-btn rnr-btn-primary" onClick={() => setCreating(true)}><PlusIcon />New report</button>}>
          Count, add up and export the records of a workflow. Build a report here, then show it on the dashboard.
        </Empty>
      )}
      {firstRun && !manage && (
        <Empty icon={NAV_ICONS.reports} title="No reports yet" action={<a className="rnr-btn rnr-btn-secondary" href="#/inbox">Go to inbox</a>}>
          No reports yet. Ask a reports manager to create one.
        </Empty>
      )}
      {!!reports.data?.length && (
        <div className="rnr-card rnr-table-card">
          <table className="rnr-table rnr-sticky-first">
            <caption className="rnr-sr-only">Reports in {orgs.find((o) => o.id === orgId)?.name ?? 'your organisation'}</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Workflow</th><th scope="col">Kind</th><th scope="col" className="num">Updated</th><th scope="col"><span className="rnr-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {reports.data.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td>{r.workflow?.name ?? 'A workflow you cannot see'}</td>
                  <td>{r.group_by ? 'Grouped' : 'Table'}</td>
                  <td className="num"><Day iso={r.updated_at} /></td>
                  <td>
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <a className="rnr-btn rnr-btn-secondary rnr-btn-sm" href={`#/reports/${r.id}`} aria-label={`Open ${r.name}`}>Open</a>
                      {manage && <button type="button" className="rnr-btn rnr-btn-ghost rnr-btn-sm" aria-label={`Delete ${r.name}`} onClick={() => { setDeleteError(null); setDoomed(r) }}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewReportDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!doomed} title={`Delete ${doomed?.name ?? ''}?`} body={deleteBody}
        confirmLabel="Delete report" busyLabel="Deleting…" busy={removal.busy} error={deleteError}
        onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} />
    </section>
  )
}

function NewReportDialog({ onClose }: { onClose(): void }) {
  const { orgId, can } = useOrg()
  const workflows = useWorkflows(orgId)
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const [name, setName] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const act = useAction()
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  const none = workflows.data?.length === 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      if (!name.trim()) { setError('Enter a name for the report.'); document.getElementById(`${uid}-n`)?.focus(); return }
      if (!workflowId) { setError('Choose the workflow to report on.'); document.getElementById(`${uid}-w`)?.focus(); return }
      const { data, error: e2 } = await createReport(orgId!, workflowId, name.trim())
      if (e2) { setError(friendlyError(e2)); return }
      location.hash = `#/reports/${data.id}`
    })
  }
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>New report</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <form onSubmit={submit} noValidate>
<div className="rnr-dialog-body">
        <div className="rnr-field" data-invalid={error?.startsWith('Enter') || undefined}>
          <label className="rnr-label" htmlFor={`${uid}-n`}>Name</label>
          <input id={`${uid}-n`} data-autofocus className="rnr-input" value={name} maxLength={120} aria-invalid={error?.startsWith('Enter') || undefined} aria-describedby={error?.startsWith('Enter') ? `${uid}-e` : undefined} onChange={(e) => setName(e.target.value)} />
        </div>
        {none ? (
          <div className="flex flex-col items-start gap-2">
            <p className="rnr-muted">There are no workflows yet. Create a workflow before making a report.</p>
            {can('workflows.manage') && <a className="rnr-btn rnr-btn-secondary" href="#/workflows">Go to workflows</a>}
          </div>
        ) : (
          <div className="rnr-field" data-invalid={error?.startsWith('Choose') || undefined}>
            <label className="rnr-label" htmlFor={`${uid}-w`}>Workflow</label>
            <select id={`${uid}-w`} className="rnr-input" value={workflowId} aria-invalid={error?.startsWith('Choose') || undefined} aria-describedby={error?.startsWith('Choose') ? `${uid}-e` : undefined} onChange={(e) => setWorkflowId(e.target.value)}>
              <option value="">Choose a workflow</option>
              {workflows.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        {error && <FieldError id={`${uid}-e`} role="alert">{error}</FieldError>}
</div>
<div className="rnr-dialog-foot">
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={act.busy}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}{act.busy ? 'Creating…' : 'Create report'}
          </button>
</div>
</form>
    </dialog>
  )
}
