import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CheckIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import { RoleEditor, type RoleDraft } from './RoleEditor'

const summary = (n: number) => (n === 0 ? 'No permissions' : n === 1 ? '1 permission' : `${n} permissions`)

export function RolesPage() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<RoleDraft | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const deletion = useAction()
  const trigger = useRef<HTMLElement | null>(null)

  const roles = useQuery({ queryKey: ['roles-full', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner, is_system, role_permissions(permission)').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data
  } })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['roles-full', orgId] }), qc.invalidateQueries({ queryKey: ['roles', orgId] })])

  const open = (d: RoleDraft) => { trigger.current = document.activeElement as HTMLElement; setEditing(d) }
  const close = () => { setEditing(null); trigger.current?.focus() }

  async function save(r: RoleDraft): Promise<string | null> {
    const { error } = await supabase.rpc('save_role', { p_org: orgId!, p_role_id: r.id as string, p_name: r.name, p_permissions: r.permissions })
    if (error) return friendlyError(error, { duplicate: 'A role with that name already exists. Choose another name.' })
    await new Promise((res) => setTimeout(res, 1600)) // let the "Saved" state show
    setEditing(null); setNotice('Role saved.'); await refresh()
    return null
  }

  const confirmDelete = () => deletion.run(async () => {
    setDeleteError(null)
    const { error } = await supabase.rpc('delete_role', { p_role_id: deleting!.id })
    if (error) {
      setDeleteError(friendlyError(error, { inUse: `${deleting!.name} is still assigned to members. Remove it from them first.` }))
      return
    }
    setNotice('Role deleted.'); setDeleting(null); await refresh()
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="roles-h">
      <div className="flex items-center gap-3">
        <h1 id="roles-h" className="page-title">Roles</h1>
        <button className={`rnr-btn ml-auto ${editing ? 'rnr-btn-secondary' : 'rnr-btn-primary'}`} type="button"
          onClick={() => open({ id: null, name: '', permissions: [], is_owner: false })}>New role</button>
      </div>
      <div aria-live="polite">{notice && <p role="status" className="rnr-status"><CheckIcon size={14} />{notice}</p>}</div>
      {editing && <RoleEditor key={editing.id ?? 'new'} role={editing} onSave={save} onClose={close} />}
      {roles.isError ? (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load roles.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => roles.refetch()}>Try again</button></div>
        </div>
      ) : !roles.data ? (
        <div className="rnr-card"><Skeleton rows={[{ w: '30%' }, { w: '20%' }, { w: '12%' }, { w: '25%' }]} /></div>
      ) : (
        <ul className="rnr-card" style={{ padding: 0 }}>
          {roles.data.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={i < roles.data.length - 1 ? { borderBottom: '1px solid var(--line-100)' } : undefined}>
              <span className="label">{r.name}</span>
              {r.is_system && <span className="rnr-chip">Default</span>}
              <span className="rnr-muted">{r.is_owner ? 'All permissions' : summary(r.role_permissions.length)}</span>
              <div className="ml-auto flex gap-2">
                <button className="rnr-btn rnr-btn-ghost" type="button" aria-label={`${r.is_owner ? 'View' : 'Edit'} ${r.name} role`}
                  onClick={() => open({ id: r.id, name: r.name, is_owner: r.is_owner, permissions: r.role_permissions.map((p) => p.permission) })}>
                  {r.is_owner ? 'View' : 'Edit'}
                </button>
                {!r.is_owner && <button className="rnr-btn rnr-btn-danger" type="button" aria-label={`Delete ${r.name} role`}
                  onClick={() => { setDeleteError(null); setDeleting({ id: r.id, name: r.name }) }}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!deleting} title={`Delete the ${deleting?.name ?? ''} role?`}
        body="Members who hold it lose its permissions. This cannot be undone." confirmLabel="Delete role" busyLabel="Deleting…"
        busy={deletion.busy} error={deleteError} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
    </section>
  )
}
