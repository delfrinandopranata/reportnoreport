import { Avatar, field } from '../ui'
import { RoleBadge } from './badges'
import { ROLE_LABEL } from './rules'
import { useCurrentUser, useUsers } from './store'

/** Previews another member's role on this device. It is not a sign-in. */
export function ViewingAs({ className = '' }: { className?: string }) {
  const me = useCurrentUser()
  const users = useUsers((s) => s.users)
  const viewAs = useUsers((s) => s.viewAs)
  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="flex items-center gap-2.5 px-1">
        <Avatar name={me.name} />
        <span className="min-w-0 text-sm leading-tight">
          <span className="block truncate font-medium">{me.name}</span>
          <RoleBadge role={me.role} />
        </span>
      </div>
      <label className="grid gap-1 text-xs text-zinc-500">
        Viewing as
        <select value={me.id} onChange={(e) => viewAs(e.target.value)} className={`${field} w-full min-w-0 py-1.5 text-zinc-900 dark:text-zinc-100`}>
          {users
            .filter((u) => u.status !== 'suspended')
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_LABEL[u.role]})
              </option>
            ))}
        </select>
      </label>
    </div>
  )
}
