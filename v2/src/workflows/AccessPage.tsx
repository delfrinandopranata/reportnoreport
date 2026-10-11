import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { FolderCard } from '../ui/FolderCard'
import { friendlyError } from '../ui/errors'
import { CheckIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useNotice } from '../ui/useNotice'
import { useRoles, type LoadedWorkflow, type RoleRow } from './api'
import { WorkflowGate } from './WorkflowGate'
import { Note } from '../ui/Note.tsx'
import { PageHead } from '../ui/PageHead'

type Grant = { role_id: string; can_start: boolean; can_view_all: boolean }
type Key = 'can_start' | 'can_view_all'
type Grants = Map<string, Grant>

function Access({ wf }: { wf: LoadedWorkflow }) {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const [notice, setNotice] = useNotice()
  const [error, setError] = useState<string | null>(null)
  const roles = useRoles(orgId)
  const queue = useRef(new Map<string, Promise<void>>())
  const gkey = ['workflow-access', wf.id]
  const grants = useQuery({ queryKey: gkey, queryFn: async () => {
    const { data, error } = await supabase.from('workflow_access').select('role_id, can_start, can_view_all').eq('workflow_id', wf.id)
    if (error) throw error
    return new Map((data as Grant[]).map((g) => [g.role_id, g])) as Grants
  } })

  const put = (role: RoleRow, key: Key, value: boolean) => qc.setQueryData<Grants>(gkey, (old) => {
    const next = new Map(old)
    next.set(role.id, { ...(old?.get(role.id) ?? { role_id: role.id, can_start: false, can_view_all: false }), [key]: value })
    return next
  })
  /** Flips at once, then writes; a failure puts the box back. Writes for one role and box run in order, so a second click is never dropped. */
  const toggle = (role: RoleRow, key: Key, value: boolean) => {
    setError(null)
    put(role, key, value)
    const lane = `${role.id}:${key}`
    const write = async () => {
      const cur = qc.getQueryData<Grants>(gkey)?.get(role.id)
      const row = { workflow_id: wf.id, org_id: wf.org_id, role_id: role.id, can_start: !!cur?.can_start, can_view_all: !!cur?.can_view_all }
      const { data, error } = await supabase.from('workflow_access').upsert(row, { onConflict: 'workflow_id,role_id' }).select('role_id')
      if (error || !data?.length) {
        put(role, key, !value)
        setError(error ? friendlyError(error) : 'You do not have permission to do that.')
        return
      }
      setNotice(`Access for ${role.name} saved.`)
    }
    queue.current.set(lane, (queue.current.get(lane) ?? Promise.resolve()).then(write))
  }
  const box = (role: RoleRow, key: Key, label: string) => (
    <label className="rnr-check">
      <input type="checkbox" checked={!!grants.data?.get(role.id)?.[key]} onChange={(e) => toggle(role, key, e.target.checked)} />
      <span className="sr-only">{label} for {role.name}</span>
    </label>
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby="acc-h">
      <PageHead id="acc-h" crumb={`Build · ${wf.name}`} title="Workflow access">
        <a className="rnr-btn rnr-btn-ghost" href={`#/workflows/${wf.id}/edit`}>Edit workflow</a>
      </PageHead>
      <FolderCard tab={<span>Access</span>}>
        <div className="grid gap-4">
          <p className="rnr-caption">A role also needs Start records or View all records on the Roles page before these take effect. Everyone always sees the records they started, submitted to or have a task on.</p>
          {error && <Note>{error}</Note>}
          <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
          {(roles.isPending || grants.isPending) && <Skeleton rows={[{ w: '100%', h: 160 }]} />}
          {(roles.isError || grants.isError) && (
            <div className="rnr-note" data-tone="down" role="alert">
              <div className="grid gap-3">
                <p>Access for this workflow did not load. Check your connection and try again.</p>
                <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => { roles.refetch(); grants.refetch() }}>Try again</button></div>
              </div>
            </div>
          )}
          {roles.data && grants.data && (
            <>
              <div className="rnr-card rnr-table-card">
                <table className="rnr-table rnr-sticky-first">
                  <caption className="rnr-sr-only">Workflow access for {wf.name}</caption>
                  <thead><tr><th scope="col">Role</th><th scope="col">Can start</th><th scope="col">Can view all records</th></tr></thead>
                  <tbody>
                    {roles.data.map((r) => (
                      <tr key={r.id}>
                        <th scope="row">{r.name}</th>
                        {r.is_owner
                          ? <><td className="rnr-muted">Always</td><td className="rnr-muted">Always</td></>
                          : <><td>{box(r, 'can_start', 'Can start')}</td><td>{box(r, 'can_view_all', 'Can view all records')}</td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {roles.data.every((r) => r.is_owner) && <p className="rnr-caption">Add roles on the Roles page to control who can start this workflow.</p>}
            </>
          )}
        </div>
      </FolderCard>
    </section>
  )
}

export function AccessPage({ id }: { id: string }) {
  return <WorkflowGate id={id}>{(wf) => <Access wf={wf} />}</WorkflowGate>
}
