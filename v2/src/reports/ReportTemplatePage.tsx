import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useForms } from '../forms/api'
import type { Field } from '../forms/logic'
import { useWorkflow, type LoadedWorkflow } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon, DownIcon, PencilIcon, TrashIcon, UpIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { useNotice } from '../ui/useNotice'
import { stepFields, type ReportTemplate } from './logic'
import { createReportTemplate, updateReportTemplate, useReportTemplate, type TemplateRow } from './api'
import { TemplatePreview } from './TemplatePreview'
import { hasAnswer, moveAnswer, normaliseTemplate, toggleAnswer, toggleSignoff } from './templateOrder'

const MAX_HEADER = 2000
const CAPTIONS: Record<string, string> = { signature: 'Prints the signature image', file: 'Prints the file name only', group: 'Prints one line per row' }
const EMPTY: ReportTemplate = { header: '', fields: [], signoff: [] }

export function ReportTemplatePage({ id }: { id: string }) {
  const { orgId, can } = useOrg()
  const wf = useWorkflow(id)
  const forms = useForms(orgId)
  const tpl = useReportTemplate(id)
  const [generation, setGeneration] = useState(0) // bumped by "Reload template" to start again from the server copy
  if (wf.isPending || forms.isPending || tpl.isPending) return <Skeleton rows={[{ w: '40%', h: 32 }, { w: '100%', h: 320 }]} />
  if (wf.isError || forms.isError || tpl.isError) {
    return (
      <div className="rnr-card gap-3 max-w-xl">
        <p role="alert">This PDF template did not load. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => { void wf.refetch(); void forms.refetch(); void tpl.refetch() }}>Try again</button></div>
      </div>
    )
  }
  if (!wf.data) return <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">This workflow does not exist</h1><p className="rnr-muted">It may have been deleted.</p></div>
  const schemas = new Map(forms.data.map((f) => [f.id, f.schema as Field[]]))
  return <TemplateForm key={generation} workflow={wf.data} schemas={schemas} saved={tpl.data} mayEditWorkflow={can('workflows.manage')}
    onReload={async () => { await tpl.refetch(); setGeneration((g) => g + 1) }} />
}

function TemplateForm({ workflow, schemas, saved, mayEditWorkflow, onReload }: {
  workflow: LoadedWorkflow; schemas: Map<string, Field[]>; saved: TemplateRow | null; mayEditWorkflow: boolean; onReload(): Promise<void>
}) {
  const { orgId, orgs } = useOrg()
  const qc = useQueryClient()
  const uid = useId()
  const steps = useMemo(() => stepFields(workflow.graph, schemas), [workflow.graph, schemas])
  const first = useMemo(() => normaliseTemplate(saved ? { header: saved.header, fields: saved.fields, signoff: saved.signoff } : EMPTY, steps), [saved, steps])
  const [t, setT] = useState<ReportTemplate>(first)
  const [base, setBase] = useState<ReportTemplate>(first)
  const [row, setRow] = useState<{ id: string; updatedAt: string } | null>(saved ? { id: saved.id, updatedAt: saved.updated_at } : null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useNotice()
  const save = useAction()
  const reloading = useAction()
  const order = useRef<HTMLDivElement>(null)
  const focusLater = useFocusAfterRender()
  const dirty = JSON.stringify(t) !== JSON.stringify(base)
  const guard = useLeaveGuard(dirty, `#/workflows/${workflow.id}/report`)
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? ''
  const over = t.header.length > MAX_HEADER
  const stepName = (nodeId: string) => steps.find((s) => s.nodeId === nodeId)?.step ?? 'a removed step'
  const labelOf = (nodeId: string, key: string) => steps.find((s) => s.nodeId === nodeId)?.fields.find((f) => f.key === key)?.label ?? key
  const known = new Set(steps.map((s) => s.nodeId))
  const orphans = t.fields.filter((f) => !known.has(f.nodeId))

  const move = (nodeId: string, key: string, by: -1 | 1, ctl: 'up' | 'down') => {
    const label = labelOf(nodeId, key)
    const moved = moveAnswer(t, nodeId, key, by)
    if (!moved) { setNotice(`${label} is already ${by < 0 ? 'first' : 'last'} in ${stepName(nodeId)}.`); return }
    setT(moved.t)
    setNotice(`${label} moved to position ${moved.position} of ${moved.total} in ${stepName(nodeId)}.`)
    // React re-parents the moved row, so put focus back on the control that was used.
    focusLater(() => order.current?.querySelector<HTMLElement>(`[data-key="${nodeId}:${key}"] [data-ctl="${ctl}"]`))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save.run(async () => {
      setError(null)
      if (over) { setError('Keep the header under 2,000 characters.'); document.getElementById(`${uid}-header`)?.focus(); return false }
      if (!row) {
        const { data, error: e2 } = await createReportTemplate(orgId!, workflow.id, t)
        if (e2) { setError(friendlyError(e2, { duplicate: 'This workflow already has a PDF template. Reload to edit it.' })); return false }
        setRow({ id: data.id, updatedAt: data.updated_at })
      } else {
        const { data, error: e2 } = await updateReportTemplate(row.id, t, row.updatedAt)
        if (e2) { setError(friendlyError(e2)); return false }
        if (!data.length) { setConflict(true); return false }
        setRow({ id: row.id, updatedAt: data[0].updated_at })
      }
      setBase(t)
      setNotice('Template saved.')
      void qc.invalidateQueries({ queryKey: ['report-template', workflow.id] })
    }, true)
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${uid}-h`}>
      <div className="flex flex-col gap-1">
        {mayEditWorkflow
          ? <a className="rnr-btn rnr-btn-ghost self-start" href="#/workflows"><BackIcon />Back to workflows</a>
          : <a className="rnr-btn rnr-btn-ghost self-start" href="#/reports"><BackIcon />Back to reports</a>}
        <h1 id={`${uid}-h`} className="page-title" tabIndex={-1}>PDF template: {workflow.name}</h1>
        <p className="rnr-muted">Every PDF of this workflow's records uses this template. Questions hidden by their rules are always left out.</p>
      </div>
      {steps.length === 0 ? (
        <div className="rnr-card gap-3 max-w-xl">
          <p className="rnr-muted">This workflow has no steps with a form yet. Add a Start form in the workflow editor first.</p>
          {mayEditWorkflow && <div><a className="rnr-btn rnr-btn-secondary" href={`#/workflows/${workflow.id}/edit`}>Open workflow editor</a></div>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="flex flex-col gap-4 min-w-0" onSubmit={submit} noValidate aria-label="PDF template">
            <div className="rnr-card gap-3">
              <div className="rnr-field" data-invalid={over || undefined}>
                <label className="rnr-label" htmlFor={`${uid}-header`}>Header</label>
                <textarea id={`${uid}-header`} className="rnr-input" rows={3} value={t.header} aria-invalid={over || undefined}
                  onChange={(e) => setT({ ...t, header: e.target.value })} aria-describedby={`${uid}-header-hint`} />
                <p id={`${uid}-header-hint`} className="rnr-hint">Printed under the record title. Each line you type prints on its own line, for example a department and an address.</p>
                {t.header.length >= 1800 && <p className="rnr-caption">{t.header.length.toLocaleString('en-GB')} of 2,000 characters</p>}
              </div>
            </div>
            <div className="rnr-card gap-3">
              <h2 className="dialog-title">Answers to include</h2>
              {steps.map((s) => (
                <fieldset key={s.nodeId} className="rnr-field">
                  <legend className="rnr-fieldset-label">{s.step}</legend>
                  {s.fields.length === 0 && <p className="rnr-caption">This step has no questions.</p>}
                  {s.fields.map((f) => (
                    <label key={f.key} className="rnr-check">
                      <input type="checkbox" checked={hasAnswer(t, s.nodeId, f.key)} onChange={(e) => setT(toggleAnswer(t, steps, { nodeId: s.nodeId, key: f.key }, e.target.checked))} />
                      {f.label}{CAPTIONS[f.type] && <span className="rnr-caption">{CAPTIONS[f.type]}</span>}
                    </label>
                  ))}
                </fieldset>
              ))}
              {t.fields.length > 0 && (
                <div ref={order} className="flex flex-col gap-2">
                  <h3 className="label">Order in the PDF</h3>
                  <ol className="flex flex-col gap-3">
                    {steps.filter((s) => t.fields.some((f) => f.nodeId === s.nodeId)).map((s) => {
                      const mine = t.fields.filter((f) => f.nodeId === s.nodeId)
                      return (
                        <li key={s.nodeId}>
                          <p className="label">{s.step}</p>
                          <ol className="rnr-order">
                            {mine.map((ref, i) => {
                              const label = labelOf(s.nodeId, ref.key)
                              return (
                                <li key={ref.key} data-key={`${s.nodeId}:${ref.key}`}>
                                  <span className="rnr-order-label">{label}</span>
                                  <button type="button" className="rnr-icon-btn" data-ctl="up" aria-label={`Move ${label} up`} aria-disabled={i === 0 || undefined} onClick={() => move(s.nodeId, ref.key, -1, 'up')}><UpIcon size={14} /></button>
                                  <button type="button" className="rnr-icon-btn" data-ctl="down" aria-label={`Move ${label} down`} aria-disabled={i === mine.length - 1 || undefined} onClick={() => move(s.nodeId, ref.key, 1, 'down')}><DownIcon size={14} /></button>
                                </li>
                              )
                            })}
                          </ol>
                        </li>
                      )
                    })}
                    {orphans.length > 0 && (
                      <li>
                        <p className="label">Steps that no longer exist</p>
                        <ol className="rnr-order">
                          {orphans.map((ref) => (
                            <li key={`${ref.nodeId}:${ref.key}`}>
                              <span className="rnr-order-label">{ref.key}</span>
                              <button type="button" className="rnr-icon-btn" aria-label={`Remove ${ref.key}`} onClick={() => setT({ ...t, fields: t.fields.filter((f) => f !== ref) })}><TrashIcon size={14} /></button>
                            </li>
                          ))}
                        </ol>
                      </li>
                    )}
                  </ol>
                </div>
              )}
            </div>
            <div role="group" aria-labelledby={`${uid}-signoff`} className="rnr-card gap-2">
              <h2 id={`${uid}-signoff`} className="dialog-title">Sign-off</h2>
              <p className="rnr-caption">Each chosen step prints who completed it, the outcome, the time in UTC and their signature if its form has one.</p>
              {steps.map((s) => (
                <label key={s.nodeId} className="rnr-check">
                  <input type="checkbox" checked={t.signoff.includes(s.nodeId)} onChange={(e) => setT(toggleSignoff(t, steps, s.nodeId, e.target.checked))} />{s.step}
                </label>
              ))}
            </div>
            {error && <p className="rnr-error" role="alert">{error}</p>}
            {conflict && (
              <div className="flex flex-col items-start gap-2" role="alert">
                <p className="rnr-error">This template was changed by someone else. Reload to see their changes.</p>
                <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={reloading.busy} onClick={() => void reloading.run(onReload)}>
                  {reloading.busy && <span className="rnr-spin" aria-hidden="true" />}{reloading.busy ? 'Reloading…' : 'Reload template'}
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="rnr-btn rnr-btn-primary" aria-busy={save.busy}>
                {save.busy && <span className="rnr-spin" aria-hidden="true" />}
                {save.saved && !save.busy && <span className="rnr-pop" aria-hidden="true"><CheckIcon /></span>}
                {save.busy ? 'Saving…' : save.saved ? 'Saved' : 'Save template'}
              </button>
              {dirty && <span className="rnr-status"><PencilIcon size={14} />Unsaved changes</span>}
            </div>
            <p className="rnr-caption" role="status">{notice}</p>
          </form>
          <TemplatePreview org={orgName} workflow={workflow.name} template={t} steps={steps} />
        </div>
      )}
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body="Your changes to this PDF template will be lost."
        confirmLabel="Leave" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}
