import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { CheckIcon, PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import { useForms, type FormRow } from './api'

const fieldCount = (f: FormRow) => f.schema.filter((x) => x.type !== 'page_break').length
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export function FormsPage() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const forms = useForms(orgId)
  const manage = can('forms.manage')
  const create = useAction()
  const removal = useAction()
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<FormRow | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const refresh = () => qc.invalidateQueries({ queryKey: ['forms', orgId] })

  const newForm = () => create.run(async () => {
    setError(null)
    const { data, error } = await supabase.from('forms').insert({ org_id: orgId!, name: 'Untitled form' }).select('id').single()
    if (error) { setError(friendlyError(error)); return }
    await refresh()
    location.hash = `#/forms/${data.id}/edit`
  })
  const newFormRef = useRef(newForm)
  useEffect(() => { newFormRef.current = newForm })

  useEffect(() => {
    if (!manage) return
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      newFormRef.current()
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [manage])

  const confirmRemove = () => removal.run(async () => {
    setRemoveError(null)
    const { data, error } = await supabase.from('forms').delete().eq('id', removing!.id).select('id')
    if (error) { setRemoveError(friendlyError(error)); return }
    if (!data.length) { setRemoveError('You do not have permission to do that.'); return } // RLS turned it into 0 rows
    setRemoving(null); setNotice('Form deleted.'); await refresh()
    document.getElementById('forms-h')?.focus() // the row that opened the dialog is gone
  })

  const firstRun = forms.data?.length === 0
  const newButton = (
    <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={create.busy} onClick={newForm}>
      {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New form'}
      {!create.busy && <kbd className="rnr-kbd" aria-hidden="true">N</kbd>}
    </button>
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby="forms-h">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="forms-h" tabIndex={-1} className="page-title">Forms</h1>
        {manage && !firstRun && <span className="ml-auto">{newButton}</span>}
      </div>
      <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      {forms.isPending && (
        <div className="rnr-card"><Skeleton rows={[{ w: '40%' }, { w: '10%' }, { w: '14%' }]} /></div>
      )}
      {forms.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load your forms. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => forms.refetch()}>Try again</button></div>
        </div>
      )}
      {firstRun && (
        <div className="rnr-card gap-3">
          {manage && (
            <div className="rnr-card" data-state="placeholder" aria-hidden="true">
              <span className="label">Leave request</span><span className="rnr-muted">6 fields</span>
            </div>
          )}
          <h2 className="dialog-title">{manage ? 'Build your first form' : 'No forms yet'}</h2>
          <p className="rnr-muted">{manage ? 'Add fields, set rules and preview it as you build. Members can fill it in once you save it.' : 'Ask a form manager to build one.'}</p>
          {manage && <div>{newButton}</div>}
        </div>
      )}
      {!!forms.data?.length && (
        <div className="rnr-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="rnr-table">
            <caption className="sr-only">Forms in this organisation</caption>
            <thead><tr><th scope="col">Name</th><th scope="col" className="num">Fields</th><th scope="col" className="num">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {forms.data.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td className="num">{fieldCount(f)}</td>
                  <td className="num">{day(f.updated_at)}</td>
                  <td>
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <a className="rnr-btn rnr-btn-secondary" href={`#/forms/${f.id}/fill`} aria-label={`Fill in ${f.name}`}>Fill in</a>
                      {manage && <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${f.id}/edit`} aria-label={`Edit ${f.name}`}>Edit</a>}
                      <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${f.id}/submissions`} aria-label={`Submissions of ${f.name}`}>Submissions</a>
                      {manage && <button className="rnr-btn rnr-btn-danger" type="button" aria-label={`Delete ${f.name}`} onClick={() => { setRemoveError(null); setRemoving(f) }}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!removing} title={`Delete ${removing?.name ?? 'this form'}?`}
        body={`${removing?.name ?? 'This form'} will be deleted for everyone and cannot be recovered. A form that already has submissions cannot be deleted.`}
        confirmLabel="Delete form" busyLabel="Deleting…" busy={removal.busy} error={removeError}
        onConfirm={confirmRemove} onClose={() => setRemoving(null)} />
    </section>
  )
}
