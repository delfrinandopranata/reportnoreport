import { CheckIcon, ClockIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import type { Role } from './InviteForm'
import { toggle } from './toggle'
import { LoadError } from '../ui/Note.tsx'

export type Member = { id: string; email: string; status: 'invited' | 'active'; user_id: string | null; member_roles: { role_id: string }[] }

type Props = {
  orgName: string; members: Member[] | undefined; roles: Role[] | undefined
  failed: boolean; manage: boolean; canRemove(m: Member): boolean; busyId: string | null
  onRetry(): void; onSetRoles(m: Member, ids: string[]): void; onRemove(m: Member): void
}

export function MembersTable({ orgName, members, roles, failed, manage, canRemove, busyId, onRetry, onSetRoles, onRemove }: Props) {
  if (failed) {
    return (
      <LoadError what="Members" onRetry={onRetry} />
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
    return (
      <div className="rnr-empty">
        <span className="rnr-kind" aria-hidden="true"><CheckIcon size={24} /></span>
        <h2>No members yet</h2>
        <p>Invite your first member to start sharing work.</p>
      </div>
    )
  }
  return (
    <div className="rnr-card rnr-table-card">
      <table className="rnr-table rnr-sticky-first">
        <caption className="rnr-sr-only">Members of {orgName}</caption>
        <thead><tr>
          <th scope="col">Email</th><th scope="col">Status</th><th scope="col">Roles</th>
          <th scope="col"><span className="rnr-sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {members.map((m) => {
            const held = m.member_roles.map((r) => r.role_id)
            return (
              <tr key={m.id} aria-busy={busyId === m.id}>
                <th scope="row" className="min-w-56">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="rnr-avatar rnr-avatar--sm" aria-hidden="true">{m.email.slice(0, 2).toUpperCase()}</span>
                    <span className="[overflow-wrap:anywhere]">{m.email}</span>
                  </span>
                </th>
                <td><span className="rnr-status">{m.status === 'invited' ? <ClockIcon size={16} /> : <CheckIcon size={16} />}{m.status === 'invited' ? 'Invited' : 'Active'}</span></td>
                <td>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {roles.map((r) => (
                      <label key={r.id} className="rnr-check">
                        <input type="checkbox" disabled={!manage} checked={held.includes(r.id)}
                          onChange={() => onSetRoles(m, toggle(held, r.id))} />{r.name}
                      </label>
                    ))}
                  </div>
                </td>
                <td>{manage && canRemove(m) && <button className="rnr-btn rnr-btn-ghost" type="button" aria-label={`Remove ${m.email}`} onClick={() => onRemove(m)}>Remove</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
