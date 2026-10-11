import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { CheckIcon, NAV_ICONS, PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { Day } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { useWorkflows, type WorkflowRow } from './api'
import { WorkflowStatusMark } from './StatusMark'
import { LoadError, Note } from '../ui/Note.tsx'
import { PageHead } from '../ui/PageHead'

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export function WorkflowsPage() {
  const { orgId, orgs, can } = useOrg()
  const qc = useQueryClient()
  const list = useWorkflows(orgId)
  const create = useAction()
  const removal = useAction()
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<WorkflowRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const refresh = () => qc.invalidateQueries({ queryKey: ['workflows', orgId] })

  const add = () => create.run(async () => {
    setCreateError(null)
    const { data, error } = await supabase.from('workflows').insert({ org_id: orgId!, name: 'Untitled workflow' }).select('id').single()
    if (error) return setCreateError(friendlyError(error))
    await refresh()
    location.hash = `#/workflows/${data.id}/edit`
  })
  const addRef = useRef(add)
  useEffect(() => { addRef.current = add })
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      addRef.current()
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [])

  const remove = () => removal.run(async () => {
    setDeleteError(null)
    const { data, error } = await supabase.from('workflows').delete().eq('id', deleting!.id).select('id')
    if (error) return setDeleteError(friendlyError(error))
    if (!data.length) return setDeleteError('You do not have permission to do that.')
    setNotice(`${deleting!.name} deleted.`)
    setDeleting(null)
    await refresh()
    focusLater('wf-h')
  })
  const firstRun = list.data?.length === 0
  const newButton = (
    <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={create.busy} onClick={add}>
      {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New workflow'}
      {!create.busy && <kbd className="rnr-kbd" aria-hidden="true">N</kbd>}
    </button>
  )

  return (
    <section className="flex flex-col" aria-labelledby="wf-h">
      <PageHead id="wf-h" crumb="Build" title="Workflows">
        {!firstRun && newButton}
      </PageHead>
      <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
      {createError && <Note>{createError}</Note>}
      {list.isPending && <div className="rnr-card"><Skeleton rows={[{ w: '40%' }, { w: '10%' }, { w: '14%' }]} /></div>}
      {list.isError && (
        <LoadError what="The workflows" onRetry={() => list.refetch()} />
      )}
      {firstRun && (
        <div className="rnr-empty">
          <span className="rnr-kind"><NAV_ICONS.workflows size={20} /></span>
          <h2>Build your first workflow</h2>
          <p>Chain your forms into steps, approvals and timers. Members start it from their Inbox once you publish it.</p>
          {newButton}
        </div>
      )}
      {!!list.data?.length && (
        <div className="rnr-card rnr-table-card">
          <table className="rnr-table rnr-sticky-first">
            <caption className="rnr-sr-only">Workflows in {orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'}</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col" className="num">Updated</th><th scope="col"><span className="rnr-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.data.map((w) => (
                <tr key={w.id}>
                  <th scope="row">{w.name}</th>
                  <td><WorkflowStatusMark status={w.status} /></td>
                  <td className="num"><Day iso={w.updated_at} /></td>
                  <td>
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <a className="rnr-btn rnr-btn-secondary" href={`#/workflows/${w.id}/edit`} aria-label={`Edit ${w.name}`}>Edit</a>
                      <a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${w.id}/access`} aria-label={`Access for ${w.name}`}>Access</a>
                      {can('reports.manage') && <a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${w.id}/report`} aria-label={`PDF template for ${w.name}`}>PDF template</a>}
                      <button className="rnr-btn rnr-btn-danger" type="button" aria-label={`Delete ${w.name}`} onClick={() => { setDeleteError(null); setDeleting(w) }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name ?? 'this workflow'}?`}
        body={`${deleting?.name ?? 'This workflow'} will be deleted for everyone and cannot be recovered. A workflow that already has records cannot be deleted.`}
        confirmLabel="Delete workflow" busyLabel="Deleting…" busy={removal.busy} error={deleteError}
        onConfirm={remove} onClose={() => { setDeleting(null); setDeleteError(null) }} />
    </section>
  )
}
