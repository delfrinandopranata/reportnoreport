import { CheckIcon, ClockIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import type { Role } from './InviteForm'
import { toggle } from './toggle'

export type Member = { id: string; email: string; status: 'invited' | 'active'; member_roles: { role_id: string }[] }

type Props = {
  orgName: string; members: Member[] | undefined; roles: Role[] | undefined
  failed: boolean; manage: boolean; busyId: string | null
  onRetry(): void; onSetRoles(m: Member, ids: string[]): void; onRemove(m: Member): void
}

export function MembersTable({ orgName, members, roles, failed, manage, busyId, onRetry, onSetRoles, onRemove }: Props) {
  if (failed) {
    return (
      <div className="rnr-card gap-3">
        <p role="alert">We could not load members.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={onRetry}>Try again</button></div>
      </div>
    )
  }
  if (!members || !roles) {
    return (
      <div className="rnr-card">
        <Skeleton rows={[{ w: '40%' }, { w: '12%' }, { w: '30%' }, { w: '10%' }]} />
      </div>
    )
  }
  if (!members.length) {
    return <div className="rnr-card"><p className="rnr-muted">Invite your first member to start sharing work.</p></div>
  }
  return (
    <div className="rnr-card" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="rnr-table">
        <caption className="sr-only">Members of {orgName}</caption>
        <thead><tr>
          <th scope="col">Email</th><th scope="col">Status</th><th scope="col">Roles</th>
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {members.map((m) => {
            const held = m.member_roles.map((r) => r.role_id)
            return (
              <tr key={m.id} aria-busy={busyId === m.id}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--rnr-card-bg)', minWidth: 96 }}>{m.email}</td>
                <td><span className="rnr-status">{m.status === 'invited' ? <ClockIcon size={14} /> : <CheckIcon size={14} />}{m.status === 'invited' ? 'Invited' : 'Active'}</span></td>
                <td>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {roles.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-ink-label">
                        <input type="checkbox" className="accent-brand" disabled={!manage} checked={held.includes(r.id)}
                          onChange={() => onSetRoles(m, toggle(held, r.id))} />{r.name}
                      </label>
                    ))}
                  </div>
                </td>
                <td>{manage && <button className="rnr-btn rnr-btn-danger" type="button" aria-label={`Remove ${m.email}`} onClick={() => onRemove(m)}>Remove</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
