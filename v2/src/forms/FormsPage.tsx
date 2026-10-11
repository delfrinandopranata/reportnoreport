import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { CheckIcon, NAV_ICONS, PlusIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import { useForms, type FormRow } from './api'

const fieldCount = (f: FormRow) => f.schema.filter((x) => x.type !== 'page_break').length
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export function FormsPage() {
  const { orgId, orgs, can } = useOrg()
  const qc = useQueryClient()
  const forms = useForms(orgId)
  const manage = can('forms.manage')
  const create = useAction()
  const removal = useAction()
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<FormRow | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const deleted = useRef(false)
  // The row that opened the dialog is gone once the list refreshes, so focus the heading from an effect on the new list.
  useEffect(() => {
    if (deleted.current && forms.data) { deleted.current = false; document.getElementById('forms-h')?.focus() }
  }, [forms.data])
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
    setRemoving(null); setNotice('Form deleted.'); deleted.current = true; await refresh()
  })

  const firstRun = forms.data?.length === 0
  const newButton = (
    <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={create.busy} onClick={newForm}>
      {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New form'}
      {!create.busy && <kbd className="rnr-kbd" aria-hidden="true">N</kbd>}
    </button>
  )

  return (
    <section className="flex flex-col" aria-labelledby="forms-h">
      <header className="rnr-page-head">
        <div>
          <p className="rnr-micro">Build</p>
          <h1 id="forms-h" tabIndex={-1} className="rnr-page-title">Forms</h1>
        </div>
        {manage && !firstRun && <div className="rnr-page-actions">{newButton}</div>}
      </header>
      <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
      {error && <p className="rnr-note" data-tone="down" role="alert">{error}</p>}
      {forms.isPending && (
        <div className="rnr-card"><Skeleton rows={[{ w: '40%' }, { w: '10%' }, { w: '14%' }]} /></div>
      )}
      {forms.isError && (
        <div className="rnr-empty" role="alert">
          <span className="rnr-kind"><XIcon size={20} /></span>
          <h2>Your forms did not load</h2>
          <p>Check your connection, then try again.</p>
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => forms.refetch()}>Try again</button>
        </div>
      )}
      {firstRun && (
        <div className="rnr-empty">
          <span className="rnr-kind"><NAV_ICONS.forms size={20} /></span>
          <h2>{manage ? 'Build your first form' : 'No forms yet'}</h2>
          <p>{manage ? 'Add fields, set rules and preview it as you build. Members can fill it in once you save it.' : 'Ask a form manager to build one.'}</p>
          {manage && newButton}
        </div>
      )}
      {!!forms.data?.length && (
        <div className="rnr-card rnr-table-card">
          <table className="rnr-table rnr-sticky-first">
            <caption className="rnr-sr-only">Forms in {orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'}</caption>
            <thead><tr><th scope="col">Name</th><th scope="col" className="num">Fields</th><th scope="col" className="num">Updated</th><th scope="col"><span className="rnr-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {forms.data.map((f) => (
                <tr key={f.id}>
                  <th scope="row">{f.name}</th>
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
