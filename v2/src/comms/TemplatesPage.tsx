import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { NAV_ICONS, PlusIcon } from '../ui/icons'
import { LoadError, Note } from './Note'
import { PageHead } from './PageHead'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { createTemplate, deleteTemplate, useTemplates, type TemplateRow } from './api'
import { clearListArrival, peekListArrival } from './arrival'
import { channelLabel, DELETE_TEMPLATE_BODY } from './channels'

export function TemplatesPage() {
  const { orgId, orgs } = useOrg()
  const templates = useTemplates(orgId)
  const qc = useQueryClient()
  const create = useAction()
  const remove = useAction()
  const [deleting, setDeleting] = useState<TemplateRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [arrival] = useState(peekListArrival)
  const [notice, setNotice] = useNotice(arrival)
  const focusLater = useFocusAfterRender()

  useEffect(() => {
    if (arrival === null) return
    clearListArrival()
    document.getElementById('templates-h')?.focus()
  }, [arrival])

  const add = () => create.run(async () => {
    setError(null)
    const { data, error: e } = await createTemplate(orgId!)
    if (e || !data) { setError(friendlyError(e)); return }
    await qc.invalidateQueries({ queryKey: ['templates', orgId] })
    location.hash = `#/templates/${data.id}`
  })
  const confirmDelete = () => remove.run(async () => {
    if (!deleting) return
    const { data, error: e } = await deleteTemplate(deleting.id)
    if (e || !data?.length) { setDeleteError(e ? friendlyError(e) : 'You do not have permission to do that.'); return }
    const name = deleting.name
    setDeleting(null)
    setDeleteError(null)
    await qc.invalidateQueries({ queryKey: ['templates', orgId] })
    setNotice(`${name} deleted.`)
    focusLater('templates-h')
  })

  return (
    <section aria-labelledby="templates-h">
      <PageHead id="templates-h" crumb="Build · Templates" title="Message templates">
        <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={create.busy} onClick={() => void add()}>
          {create.busy ? <span className="rnr-spin" aria-hidden="true" /> : <PlusIcon />}{create.busy ? 'Creating…' : 'New template'}
        </button>
      </PageHead>
      <div className="flex flex-col gap-4">
        {error && <Note role="alert">{error}</Note>}
        <p className="rnr-caption" role="status">{notice}</p>
        {templates.isPending && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
        {templates.isError && <LoadError what="The templates" onRetry={() => void templates.refetch()} />}
        {templates.data && (
          <div className="rnr-card rnr-table-card">
            <table className="rnr-table rnr-sticky-first">
              <caption className="sr-only">Message templates in {orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'}</caption>
              <thead><tr><th scope="col">Name</th><th scope="col">Channel</th><th scope="col" className="num">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {templates.data.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">{t.name}{t.is_system && <> <span className="rnr-chip">System</span></>}</th>
                    <td>{channelLabel(t.kind, t.channel)}</td>
                    <td className="num whitespace-nowrap"><When iso={t.updated_at} /></td>
                    <td>
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        <a className="rnr-btn rnr-btn-secondary rnr-btn-sm" href={`#/templates/${t.id}`} aria-label={`Edit ${t.name}`}>Edit</a>
                        {!t.is_system && (
                          <button className="rnr-btn rnr-btn-danger rnr-btn-sm" type="button" aria-label={`Delete ${t.name}`} onClick={() => { setDeleteError(null); setDeleting(t) }}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {templates.data && !templates.data.some((t) => !t.is_system) && (
          <div className="rnr-empty">
            <span className="rnr-kind"><NAV_ICONS.templates size={20} /></span>
            <h2>Write your own template</h2>
            <p>System templates cover tasks, approvals and invitations. Create a template of your own to use in a workflow's Send message action.</p>
          </div>
        )}
      </div>
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name ?? 'this template'}?`} busy={remove.busy} error={deleteError}
        body={DELETE_TEMPLATE_BODY(deleting?.name ?? 'This template')}
        confirmLabel="Delete template" busyLabel="Deleting…" onConfirm={() => void confirmDelete()} onClose={() => { setDeleting(null); setDeleteError(null) }} />
    </section>
  )
}
