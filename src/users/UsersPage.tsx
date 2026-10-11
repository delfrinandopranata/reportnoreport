import { useMemo, useState, type FormEvent } from 'react'
import { ColumnHeader, ColumnsDialog, useTableLayout, type Column } from '../table'
import { Avatar, btn, Dialog, Field, Icon, input, nextSort, field, type Sort } from '../ui'
import type { Member } from '../data/mappers'
import { useMembers, useTeam } from '../data/queries'
import { useSession } from '../data/session'
import { formatDate } from '../settings/constants'
import { RoleBadge, STATUS_LABEL, StatusBadge } from './badges'
import { ACTIONS, can, isValidEmail, ROLE_LABEL, ROLE_SUMMARY, ROLES, type Role, type Status } from './rules'

const ASSIGNABLE = ROLES.filter((r) => r !== 'owner')
const STATUSES: Status[] = ['active', 'invited', 'suspended']
type SortKey = 'name' | 'email' | 'role' | 'status' | 'active'

function lastActive(user: Member, dateFormat: 'text' | 'numeric'): string {
  if (!user.lastActiveAt) return user.status === 'invited' ? 'Not signed in yet' : 'Never'
  const days = Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / 86_400_000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  return days < 14 ? `${days} days ago` : formatDate(user.lastActiveAt.slice(0, 10), dateFormat)
}

const Err = ({ text }: { text: string }) =>
  text ? (
    <p className="rnr-error" role="alert">
      {text}
    </p>
  ) : null

function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (name: string) => void }) {
  const { invite } = useTeam()
  const [error, setError] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('viewer')
  const close = () => {
    setError('')
    setRole('viewer')
    onClose()
  }
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name')).trim()
    const email = String(data.get('email')).trim()
    if (!name) return setError('Enter their full name.')
    if (!isValidEmail(email)) return setError('Enter a valid email address.')
    try {
      await invite.mutateAsync({ name, email, role: String(data.get('role')) as Exclude<Role, 'owner'> })
    } catch (err) {
      return setError((err as Error).message)
    }
    onInvited(name)
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
          <select name="role" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)} aria-describedby="invite-role-help" className={input}>
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <span id="invite-role-help" className="rnr-hint">
            {ROLE_SUMMARY[role]}
          </span>
        </Field>
        <p className="rnr-note" data-tone="info"><Icon name="info" className="size-5" /><span>They'll get an email with a link to set their password. The link expires in 24 hours; you can resend it from Manage.</span></p>
        <Err text={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={close}>
            Cancel
          </button>
          <button className={btn.primary} disabled={invite.isPending}>{invite.isPending ? 'Sending…' : 'Send invitation'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function ManageDialog({ id, members, onClose }: { id: string | null; members: Member[]; onClose: () => void }) {
  const target = members.find((u) => u.id === id)
  const team = useTeam()
  const [confirming, setConfirming] = useState<'remove' | 'transfer' | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const { profile: me } = useSession()
  const close = () => {
    setConfirming(null)
    setError('')
    onClose()
  }
  const run = async (action: () => Promise<unknown>, closeAfter = false, message = '') => {
    setConfirming(null)
    setInfo('')
    try {
      await action()
      setError('')
      if (closeAfter) close()
      else setInfo(message)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={!!target} onClose={close} title="Manage user">
      {target && (
        <div className="grid gap-5 text-sm">
          <div className="flex items-center gap-3">
            <Avatar name={target.name} size="size-10" />
            <div className="min-w-0">
              <p className="truncate font-medium">{target.name}</p>
              <p className="rnr-muted truncate">{target.email}</p>
            </div>
            <span className="ml-auto">
              <StatusBadge status={target.status} />
            </span>
          </div>

          <Field label="Role">
            <select value={target.role} disabled={team.changeRole.isPending} onChange={(e) => run(() => team.changeRole.mutateAsync({ profileId: target.id, role: e.target.value as Role }), false, `Role changed to ${ROLE_LABEL[e.target.value as Role]}.`)} className={input}>
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <span className="rnr-hint">{ROLE_SUMMARY[target.role]}</span>
          </Field>

          <Err text={error} />
          <p className="rnr-hint empty:hidden" role="status">{info}</p>

          {confirming ? (
            <div role="alertdialog" aria-label={confirming === 'remove' ? 'Confirm removal' : 'Confirm transfer of ownership'} className="rnr-note grid gap-3" data-tone={confirming === 'remove' ? 'down' : 'warn'}>
              <p className="flex items-start gap-3">
                <Icon name="alert" className="size-5 shrink-0" />
                <span>
                  {confirming === 'remove'
                    ? `Remove ${target.name}? They lose access straight away and can be invited again later.`
                    : `Make ${target.name} the owner? You become an admin and can’t undo this yourself.`}
                </span>
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className={btn.ghost} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
                <button type="button" className={confirming === 'remove' ? btn.danger : btn.primary} onClick={() => run(() => (confirming === 'remove' ? team.remove : team.transferOwnership).mutateAsync(target.id), true)}>
                  {confirming === 'remove' ? 'Remove user' : 'Transfer ownership'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rnr-actions mt-0 flex-wrap justify-start">
              {target.status === 'suspended' ? (
                <button type="button" className={btn.ghost} onClick={() => run(() => team.reactivate.mutateAsync(target.id), false, `${target.name} can sign in again.`)}>
                  Reactivate
                </button>
              ) : target.status === 'active' ? (
                <button type="button" className={btn.ghost} title="They keep their account but can't sign in until reactivated" onClick={() => run(() => team.suspend.mutateAsync(target.id), false, `${target.name} is suspended and can't sign in.`)}>
                  Suspend
                </button>
              ) : null}
              {target.status === 'invited' && (
                <button type="button" className={btn.ghost} onClick={() => run(() => team.resend.mutateAsync(target.id), false, 'Invitation resent. The new link works for 24 hours.')}>
                  Resend invite
                </button>
              )}
              {me.role === 'owner' && target.status === 'active' && (
                <button type="button" className={btn.secondary} onClick={() => setConfirming('transfer')}>
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
    <section className="rnr-folder min-w-0" aria-labelledby="roles-heading">
      <span className="rnr-folder-tab" id="roles-heading">Roles and permissions</span>
      <div className="rnr-folder-body">
        <div className="rnr-perf" aria-hidden="true" />
        <p className="rnr-muted mb-4">What each role can do. Everyone can view clients, balances and statements.</p>
        <div className="rnr-table-bare relative max-w-full min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="Roles and permissions table">
          <table className="rnr-table min-w-[560px]">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col">
                    <RoleBadge role={r} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.label}</th>
                  {ROLES.map((r) => (
                    <td key={r}>
                      {can(r, a.id) ? (
                        <span className="rnr-status" data-tone="ok">
                          <Icon name="check" />
                          <span className="rnr-sr-only">Allowed</span>
                        </span>
                      ) : (
                        <span className="rnr-muted">
                          —<span className="rnr-sr-only">Not allowed</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="rnr-muted">{ROLE_SUMMARY[r]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export function UsersPage() {
  const { data: users = [], isPending, error: loadError } = useMembers()
  const session = useSession()
  const me = session.profile
  const dateFormat = session.firm.dateFormat
  const canManage = session.can('users.manage') && session.canWrite
  const [q, setQ] = useState('')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [sort, setSort] = useState<Sort<SortKey>>({ key: 'name', dir: 'asc' })
  const [dialog, setDialog] = useState<'invite' | 'columns' | null>(null)
  const [managing, setManaging] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const columns: Column<Member, SortKey>[] = [
    {
      id: 'name',
      label: 'Name',
      width: 220,
      flex: true,
      sortKey: 'name',
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={u.name} />
          <span className="truncate font-medium" title={u.name}>
            {u.name}
            {u.id === me.id && <span className="rnr-hint ml-1.5">(you)</span>}
          </span>
        </span>
      ),
      text: (u) => u.name,
    },
    { id: 'email', label: 'Email', width: 230, sortKey: 'email', cell: (u) => <span className="rnr-muted block truncate" title={u.email}>{u.email}</span>, text: (u) => u.email },
    { id: 'role', label: 'Role', width: 150, sortKey: 'role', cell: (u) => <RoleBadge role={u.role} />, text: (u) => ROLE_LABEL[u.role] },
    { id: 'status', label: 'Status', width: 120, sortKey: 'status', cell: (u) => <StatusBadge status={u.status} />, text: (u) => STATUS_LABEL[u.status] },
    { id: 'active', label: 'Last active', width: 150, sortKey: 'active', cell: (u) => <span className="rnr-muted">{lastActive(u, dateFormat)}</span>, text: (u) => lastActive(u, dateFormat) },
    {
      id: 'actions',
      label: 'Actions',
      width: 120,
      align: 'right',
      cell: (u) =>
        canManage && u.id !== me.id && u.role !== 'owner' ? (
          <button type="button" className={btn.ghost} onClick={() => setManaging(u.id)} aria-label={`Manage ${u.name}`}>
            Manage
          </button>
        ) : null,
      text: () => '',
    },
  ]
  const table = useTableLayout('users', columns.filter((c) => c.id !== 'actions' || canManage))
  const visible = table.visible
  const minWidth = visible.reduce((sum, c) => sum + table.widthOf(c), 0)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const key = (u: Member) => (sort.key === 'role' ? ROLES.indexOf(u.role) : sort.key === 'active' ? (u.lastActiveAt ?? '') : u[sort.key])
    const dir = sort.dir === 'asc' ? 1 : -1
    return users
      .filter((u) => (role === 'all' || u.role === role) && (status === 'all' || u.status === status) && (!needle || `${u.name} ${u.email}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const [x, y] = [key(a), key(b)]
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir || a.name.localeCompare(b.name)
      })
  }, [users, q, role, status, sort])

  const filtersActive = !!q || role !== 'all' || status !== 'all'
  const select = field

  return (
    <div className="rnr-wide grid grid-cols-1 gap-6">
      {!canManage && <p className="rnr-note rnr-note--bar" data-tone="warn"><Icon name="alert" className="size-5" /><span>{session.can('users.manage') ? (session.writeBlockReason ?? '') : `You’re signed in as ${ROLE_LABEL[me.role]}. Only an owner or admin can change users.`}</span></p>}

      <div className="rnr-card grid gap-4 print:hidden">
        {/* Actions: Invite user is the one primary action; Columns is a demoted secondary (Fitts's Law) */}
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={() => setDialog('columns')}>
            <Icon name="columns" /> Columns
          </button>
          {canManage && (
            <button type="button" className={btn.primary} onClick={() => setDialog('invite')}>
              <Icon name="plus" /> Invite user
            </button>
          )}
        </div>

        {/* Search + filters: search leads, as is conventional (Jakob's Law) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="rnr-input-wrap min-w-48 flex-1 sm:max-w-xs">
            <Icon name="search" className="size-5" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className={input} />
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
            <button type="button" className={`${btn.ghost} ml-auto`} onClick={() => (setQ(''), setRole('all'), setStatus('all'))}>
              <Icon name="x" /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div role="status">
        {notice && <p className="rnr-note" data-tone="ok"><Icon name="check" className="size-5" /><span>{notice}</span></p>}
      </div>

      <div className="rnr-table-card rnr-card">
        {isPending ? (
          <p className="rnr-muted p-6 text-center">Loading…</p>
        ) : loadError ? (
          <p role="alert" className="rnr-error justify-center p-6">{loadError.message}</p>
        ) : rows.length ? (
          <table className={`rnr-table table-fixed [&_th]:relative ${table.layout.dense ? '[&_td]:py-1.5' : ''}`} style={{ minWidth }}>
            <caption className="rnr-sr-only">{`${rows.length} ${rows.length === 1 ? 'user' : 'users'}`}</caption>
            <colgroup>
              {visible.map((c) => (
                <col key={c.id} style={c.flex ? { minWidth: table.widthOf(c) } : { width: table.widthOf(c) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visible.map((c) => (
                  <ColumnHeader key={c.id} column={c} width={table.widthOf(c)} onResize={(w) => table.setWidth(c.id, w)} sort={sort} onSort={(k) => setSort(nextSort(sort, k))} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  {visible.map((c) => (
                    <td key={c.id} className={`truncate ${c.align === 'right' ? 'text-right' : ''}`}>
                      {c.cell(u)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rnr-muted p-6 text-center">{filtersActive ? 'No one matches these filters.' : 'No users yet.'}</p>
        )}
        {!isPending && !loadError && users.length === 1 && users[0].id === me.id && !filtersActive && (
          <div className="rnr-empty m-4">
            <h3>It's just you so far</h3>
            <p>{canManage ? 'Invite your partners, accountants or clerks so they can work in the same firm account.' : 'An owner or admin can invite the rest of your team.'}</p>
            {canManage && (
              <button type="button" className={btn.primary} onClick={() => setDialog('invite')}>
                <Icon name="plus" /> Invite your first user
              </button>
            )}
          </div>
        )}
      </div>

      <RolesPanel />

      <InviteDialog open={dialog === 'invite'} onClose={() => setDialog(null)} onInvited={(name) => setNotice(`${name} was invited. They'll get an email to set their password.`)} />
      <ManageDialog key={managing} id={managing} members={users} onClose={() => setManaging(null)} />
      <ColumnsDialog open={dialog === 'columns'} onClose={() => setDialog(null)} table={table} />
    </div>
  )
}
