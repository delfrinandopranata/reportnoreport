import { useMemo, useState, type FormEvent } from 'react'
import { ColumnHeader, ColumnsDialog, useTableLayout, type Column } from '../table'
import { Avatar, btn, Dialog, Field, Icon, input, nextSort, field, type Sort } from '../ui'
import { formatDate } from '../settings/store'
import { RoleBadge, STATUS_LABEL, StatusBadge } from './badges'
import { ACTIONS, can, canManageUser, ROLE_LABEL, ROLE_SUMMARY, ROLES, type Role, type Status, type User } from './rules'
import { useCurrentUser, useUsers } from './store'
import { ViewingAs } from './ViewingAs'

const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900'
const ASSIGNABLE = ROLES.filter((r) => r !== 'owner')
const STATUSES: Status[] = ['active', 'invited', 'suspended']
type SortKey = 'name' | 'email' | 'role' | 'status' | 'active'

function lastActive(user: User): string {
  if (!user.lastActiveAt) return user.status === 'invited' ? 'Not signed in yet' : 'Never'
  const days = Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / 86_400_000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  return days < 14 ? `${days} days ago` : formatDate(user.lastActiveAt.slice(0, 10))
}

const Err = ({ text }: { text: string }) =>
  text ? (
    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
      {text}
    </p>
  ) : null

function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (name: string) => void }) {
  const invite = useUsers((s) => s.invite)
  const [error, setError] = useState('')
  const close = () => {
    setError('')
    onClose()
  }
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name'))
    const message = invite({ name, email: String(data.get('email')), role: String(data.get('role')) as Role })
    if (message) return setError(message)
    onInvited(name.trim())
    close()
  }
  return (
    <Dialog open={open} onClose={close} title="Invite user">
      <form onSubmit={onSubmit} className="grid gap-3" noValidate>
        <Field label="Full name">
          <input name="name" autoComplete="off" className={input} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="off" className={input} />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue="viewer" className={input}>
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-sm text-zinc-500">The invitation email is sent once the backend is connected. Until then the person is listed as invited.</p>
        <Err text={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={close}>
            Cancel
          </button>
          <button className={btn.primary}>Add invitation</button>
        </div>
      </form>
    </Dialog>
  )
}

function ManageDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const target = useUsers((s) => s.users.find((u) => u.id === id))
  const { setRole, suspend, reactivate, remove, transferOwnership } = useUsers.getState()
  const [confirming, setConfirming] = useState<'remove' | 'transfer' | null>(null)
  const [error, setError] = useState('')
  const me = useCurrentUser()
  const close = () => {
    setConfirming(null)
    setError('')
    onClose()
  }
  const run = (action: () => string | null, closeAfter = false) => {
    const message = action()
    setConfirming(null)
    setError(message ?? '')
    if (!message && closeAfter) close()
  }

  return (
    <Dialog open={!!target} onClose={close} title="Manage user">
      {target && (
        <div className="grid gap-5 text-sm">
          <div className="flex items-center gap-3">
            <Avatar name={target.name} size="size-10" />
            <div className="min-w-0">
              <p className="truncate font-medium">{target.name}</p>
              <p className="truncate text-zinc-500">{target.email}</p>
            </div>
            <span className="ml-auto">
              <StatusBadge status={target.status} />
            </span>
          </div>

          <Field label="Role">
            <select value={target.role} onChange={(e) => run(() => setRole(target.id, e.target.value as Role))} className={input}>
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <span className="text-zinc-500">{ROLE_SUMMARY[target.role]}</span>
          </Field>

          <Err text={error} />

          {confirming ? (
            <div className="grid gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p>
                {confirming === 'remove'
                  ? `Remove ${target.name}? They lose access straight away and can be invited again later.`
                  : `Make ${target.name} the owner? You become an admin and can’t undo this yourself.`}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className={btn.ghost} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
                <button type="button" className={confirming === 'remove' ? `${btn.danger} border border-red-200 dark:border-red-900` : btn.primary} onClick={() => run(() => (confirming === 'remove' ? remove(target.id) : transferOwnership(target.id)), true)}>
                  {confirming === 'remove' ? 'Remove user' : 'Transfer ownership'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              {target.status === 'suspended' ? (
                <button type="button" className={btn.ghost} onClick={() => run(() => reactivate(target.id))}>
                  Reactivate
                </button>
              ) : (
                <button type="button" className={btn.ghost} onClick={() => run(() => suspend(target.id))}>
                  Suspend
                </button>
              )}
              {me.role === 'owner' && target.status === 'active' && (
                <button type="button" className={btn.ghost} onClick={() => setConfirming('transfer')}>
                  Transfer ownership
                </button>
              )}
              <button type="button" className={`${btn.danger} ml-auto`} onClick={() => setConfirming('remove')}>
                <Icon name="trash" /> Remove
              </button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function RolesPanel() {
  return (
    <section className={`${card} relative overflow-hidden`} aria-labelledby="roles-heading">
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 id="roles-heading" className="font-semibold">
          Roles and permissions
        </h2>
        <p className="text-sm text-zinc-500">What each role can do. Everyone can view clients, balances and statements.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left align-bottom dark:border-zinc-800">
              <th className="px-5 py-3 font-medium text-zinc-500">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="px-3 py-3 font-medium">
                  <RoleBadge role={r} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {ACTIONS.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-2.5">{a.label}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-3 py-2.5">
                    {can(r, a.id) ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        <Icon name="check" />
                        <span className="sr-only">Allowed</span>
                      </span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">
                        —<span className="sr-only">Not allowed</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-x-6 gap-y-2 border-t border-zinc-100 px-5 py-4 text-sm sm:grid-cols-2 dark:border-zinc-800">
        {ROLES.map((r) => (
          <div key={r}>
            <dt className="font-medium">{ROLE_LABEL[r]}</dt>
            <dd className="text-zinc-500">{ROLE_SUMMARY[r]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function UsersPage() {
  const users = useUsers((s) => s.users)
  const me = useCurrentUser()
  const canManage = can(me.role, 'users.manage')
  const [q, setQ] = useState('')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [sort, setSort] = useState<Sort<SortKey>>({ key: 'name', dir: 'asc' })
  const [dialog, setDialog] = useState<'invite' | 'columns' | null>(null)
  const [managing, setManaging] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const columns: Column<User, SortKey>[] = [
    {
      id: 'name',
      label: 'Name',
      width: 220,
      flex: true,
      sortKey: 'name',
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={u.name} />
          <span className="truncate font-medium">
            {u.name}
            {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-zinc-500">(you)</span>}
          </span>
        </span>
      ),
      text: (u) => u.name,
    },
    { id: 'email', label: 'Email', width: 230, sortKey: 'email', cell: (u) => <span className="text-zinc-600 dark:text-zinc-400">{u.email}</span>, text: (u) => u.email },
    { id: 'role', label: 'Role', width: 120, sortKey: 'role', cell: (u) => <RoleBadge role={u.role} />, text: (u) => ROLE_LABEL[u.role] },
    { id: 'status', label: 'Status', width: 120, sortKey: 'status', cell: (u) => <StatusBadge status={u.status} />, text: (u) => STATUS_LABEL[u.status] },
    { id: 'active', label: 'Last active', width: 150, sortKey: 'active', cell: (u) => <span className="text-zinc-500">{lastActive(u)}</span>, text: lastActive },
    {
      id: 'actions',
      label: 'Actions',
      width: 120,
      align: 'right',
      cell: (u) =>
        canManageUser(me, u) ? (
          <button type="button" className={`${btn.ghost} py-1`} onClick={() => setManaging(u.id)} aria-label={`Manage ${u.name}`}>
            Manage
          </button>
        ) : null,
      text: () => '',
    },
  ]
  const table = useTableLayout('users', columns.filter((c) => c.id !== 'actions' || canManage))
  const visible = table.visible
  const pad = table.layout.dense ? 'px-4 py-1.5' : 'px-4 py-2.5'
  const minWidth = visible.reduce((sum, c) => sum + table.widthOf(c), 0)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const key = (u: User) => (sort.key === 'role' ? ROLES.indexOf(u.role) : sort.key === 'active' ? (u.lastActiveAt ?? '') : u[sort.key])
    const dir = sort.dir === 'asc' ? 1 : -1
    return users
      .filter((u) => (role === 'all' || u.role === role) && (status === 'all' || u.status === status) && (!needle || `${u.name} ${u.email}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const [x, y] = [key(a), key(b)]
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir || a.name.localeCompare(b.name)
      })
  }, [users, q, role, status, sort])

  const filtersActive = !!q || role !== 'all' || status !== 'all'
  const select = `${field} py-1.5`

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className={`${card} grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-start`}>
        <div className="grid gap-1 text-sm">
          <p className="font-medium">Sign-in isn’t connected yet</p>
          <p className="text-zinc-500">
            Everyone listed here is set up and previewed on this device. Real sign-in and separation of each business’s data arrive when the backend is connected. Use “Viewing as” to see what each role can see and do.
          </p>
          {!canManage && <p className="font-medium text-amber-700 dark:text-amber-400">You’re viewing as {ROLE_LABEL[me.role]}. Only an owner or admin can change users.</p>}
        </div>
        <ViewingAs className="sm:w-60" />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className={`${input} py-1.5 pl-9`} />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value as Role | 'all')} aria-label="Role" className={select}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')} aria-label="Status" className={select}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" className={btn.ghost} onClick={() => (setQ(''), setRole('all'), setStatus('all'))}>
            <Icon name="x" /> Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={btn.ghost} onClick={() => setDialog('columns')}>
            <Icon name="columns" /> Columns
          </button>
          {canManage && (
            <button type="button" className={btn.primary} onClick={() => setDialog('invite')}>
              <Icon name="plus" /> Invite user
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status">
          {notice}
        </p>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="border-b border-zinc-100 px-5 py-3 text-sm font-medium dark:border-zinc-800">
          {rows.length} {rows.length === 1 ? 'user' : 'users'}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm" style={{ minWidth }}>
              <colgroup>
                {visible.map((c) => (
                  <col key={c.id} style={c.flex ? { minWidth: table.widthOf(c) } : { width: table.widthOf(c) }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  {visible.map((c) => (
                    <ColumnHeader key={c.id} column={c} width={table.widthOf(c)} onResize={(w) => table.setWidth(c.id, w)} sort={sort} onSort={(k) => setSort(nextSort(sort, k))} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((u) => (
                  <tr key={u.id} className="transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    {visible.map((c) => (
                      <td key={c.id} className={`${pad} truncate ${c.align === 'right' ? 'text-right' : ''}`}>
                        {c.cell(u)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-zinc-500">{filtersActive ? 'No one matches these filters.' : 'No users yet.'}</p>
        )}
      </div>

      <RolesPanel />

      <InviteDialog open={dialog === 'invite'} onClose={() => setDialog(null)} onInvited={(name) => setNotice(`${name} was added as invited. Their email invitation is sent once the backend is connected.`)} />
      <ManageDialog key={managing} id={managing} onClose={() => setManaging(null)} />
      <ColumnsDialog open={dialog === 'columns'} onClose={() => setDialog(null)} table={table} />
    </div>
  )
}
