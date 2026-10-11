import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CheckIcon, XIcon } from '../ui/icons'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import { InviteForm, type Role } from './InviteForm'
import { MembersTable, type Member } from './MembersTable'

export function MembersPage() {
  const { orgs, orgId, userId, can } = useOrg()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const removal = useAction()
  const manage = can('members.manage')
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'

  const roles = useQuery({ queryKey: ['roles', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('roles').select('id, name, is_owner').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as Role[]
  } })
  const members = useQuery({ queryKey: ['members', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('members').select('id, email, status, user_id, member_roles(role_id)').eq('org_id', orgId!).order('email')
    if (error) throw error
    return data as Member[]
  } })
  // UI hint only: the database refuses a non-Owner removing an Owner.
  const ownerId = roles.data?.find((r) => r.is_owner)?.id
  const isOwner = !!members.data?.find((m) => m.user_id === userId)?.member_roles.some((r) => r.role_id === ownerId)
  const canRemove = (m: Member) => isOwner || !m.member_roles.some((r) => r.role_id === ownerId)
  const refresh = () => qc.invalidateQueries({ queryKey: ['members', orgId] })

  async function setRoles(m: Member, ids: string[]) {
    if (busyId) return
    setError(null); setBusyId(m.id)
    const { error } = await supabase.rpc('set_member_roles', { p_member_id: m.id, p_role_ids: ids })
    if (error) setError(friendlyError(error))
    await refresh()
    setBusyId(null)
  }

  const confirmRemove = () => removal.run(async () => {
    setRemoveError(null)
    const { error } = await supabase.rpc('remove_member', { p_member_id: removing!.id })
    if (error) { setRemoveError(friendlyError(error)); return }
    setNotice('Member removed.'); setRemoving(null); await refresh()
    document.getElementById('members-h')?.focus() // the row that opened the dialog is gone
  })

  return (
    <section className="rnr-wide" aria-labelledby="members-h">
      <header className="rnr-page-head">
        <div>
          <p className="rnr-micro">Admin</p>
          <h1 id="members-h" tabIndex={-1} className="rnr-page-title">Members</h1>
        </div>
      </header>
      <div className="flex flex-col gap-4">
        <div aria-live="polite">{notice && <p role="status" className="rnr-status"><CheckIcon size={16} />{notice}</p>}</div>
        <div>{error && <div className="rnr-note" data-tone="down" role="alert"><XIcon size={20} /><div>{error}</div></div>}</div>
        {manage && orgId && <InviteForm orgId={orgId} roles={roles.data} onDone={refresh} onNotice={setNotice} />}
        <MembersTable orgName={orgName} members={members.data} roles={roles.data} failed={members.isError || roles.isError}
          manage={manage} canRemove={canRemove} busyId={busyId} onRetry={() => { members.refetch(); roles.refetch() }}
          onSetRoles={setRoles} onRemove={(m) => { setRemoveError(null); setRemoving(m) }} />
      </div>
      <ConfirmDialog open={!!removing} title={`Remove ${removing?.email ?? ''}?`}
        body={`They lose access to ${orgName} straight away.`} confirmLabel="Remove member" busyLabel="Removing…"
        busy={removal.busy} error={removeError} onConfirm={confirmRemove} onClose={() => setRemoving(null)} />
    </section>
  )
}
