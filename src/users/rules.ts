/** Pure user/role rules: no React, no storage, so they can be unit-tested and reused by a backend later. */

export type Role = 'owner' | 'admin' | 'accountant' | 'viewer'
export type Status = 'active' | 'invited' | 'suspended'
export type User = {
  id: string
  name: string
  email: string
  role: Role
  status: Status
  createdAt: string
  invitedAt?: string
  lastActiveAt?: string
}
export type Action = 'clients.edit' | 'clients.delete' | 'transactions.post' | 'transactions.delete' | 'users.manage' | 'settings.manage'
export type Result = { ok: true; users: User[] } | { ok: false; error: string }

export const ROLES: Role[] = ['owner', 'admin', 'accountant', 'viewer']
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', accountant: 'Accountant', viewer: 'Viewer' }
export const ROLE_SUMMARY: Record<Role, string> = {
  owner: 'Full control, including transferring ownership.',
  admin: 'Runs the business day to day. Manages users and settings, but not the owner.',
  accountant: 'Records receipts and payments and edits client details.',
  viewer: 'Read-only access to clients, balances and statements.',
}
export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'clients.edit', label: 'Add and edit clients' },
  { id: 'clients.delete', label: 'Delete clients' },
  { id: 'transactions.post', label: 'Post receipts and payments' },
  { id: 'transactions.delete', label: 'Delete transactions' },
  { id: 'users.manage', label: 'Manage users and roles' },
  { id: 'settings.manage', label: 'Edit business settings' },
]

const GRANTS: Record<Role, readonly Action[]> = {
  owner: ACTIONS.map((a) => a.id),
  admin: ACTIONS.map((a) => a.id),
  accountant: ['clients.edit', 'transactions.post', 'transactions.delete'],
  viewer: [],
}

export const can = (role: Role, action: Action): boolean => GRANTS[role].includes(action)

const fail = (error: string): Result => ({ ok: false, error })
const ok = (users: User[]): Result => ({ ok: true, users })
const replace = (users: User[], id: string, patch: Partial<User>) => users.map((u) => (u.id === id ? { ...u, ...patch } : u))

export const normaliseEmail = (email: string) => email.trim().toLowerCase()
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
const emailTaken = (users: User[], email: string) => users.some((u) => normaliseEmail(u.email) === normaliseEmail(email))

/** The owner row is never managed directly: ownership only moves via transferOwnership. */
export function canManageUser(actor: User, target: User): boolean {
  return can(actor.role, 'users.manage') && actor.id !== target.id && target.role !== 'owner'
}

type Guarded = { actor: User; target: User } | { error: string }

function guard(users: User[], actorId: string, targetId: string): Guarded {
  const actor = users.find((u) => u.id === actorId)
  const target = users.find((u) => u.id === targetId)
  if (!actor || !can(actor.role, 'users.manage')) return { error: 'You don’t have permission to manage users.' }
  if (!target) return { error: 'That user no longer exists.' }
  if (target.role === 'owner') {
    return { error: actor.id === target.id ? 'The owner can’t be demoted, suspended or removed. Transfer ownership first.' : 'Only a transfer of ownership can change the owner.' }
  }
  if (actor.id === target.id) return { error: 'You can’t change your own account.' }
  return { actor, target }
}

export function inviteUser(users: User[], actorId: string, input: { name: string; email: string; role: Role }, now: string, id: string): Result {
  const actor = users.find((u) => u.id === actorId)
  if (!actor || !can(actor.role, 'users.manage')) return fail('You don’t have permission to manage users.')
  const name = input.name.trim()
  if (!name) return fail('Enter a name.')
  if (!isValidEmail(input.email)) return fail('Enter a valid email address.')
  if (emailTaken(users, input.email)) return fail('Someone with that email already has access.')
  if (input.role === 'owner') return fail('There is only one owner. Transfer ownership instead.')
  return ok([...users, { id, name, email: input.email.trim(), role: input.role, status: 'invited', createdAt: now, invitedAt: now }])
}

export function changeRole(users: User[], actorId: string, targetId: string, role: Role): Result {
  const g = guard(users, actorId, targetId)
  if ('error' in g) return fail(g.error)
  if (role === 'owner') return fail('There is only one owner. Transfer ownership instead.')
  return ok(replace(users, targetId, { role }))
}

export function suspendUser(users: User[], actorId: string, targetId: string): Result {
  const g = guard(users, actorId, targetId)
  if ('error' in g) return fail(g.error)
  return ok(replace(users, targetId, { status: 'suspended' }))
}

/** Someone who never signed in goes back to "invited" rather than straight to active. */
export function reactivateUser(users: User[], actorId: string, targetId: string): Result {
  const g = guard(users, actorId, targetId)
  if ('error' in g) return fail(g.error)
  return ok(replace(users, targetId, { status: g.target.lastActiveAt ? 'active' : 'invited' }))
}

export function removeUser(users: User[], actorId: string, targetId: string): Result {
  const g = guard(users, actorId, targetId)
  if ('error' in g) return fail(g.error)
  return ok(users.filter((u) => u.id !== targetId))
}

/** The previous owner becomes an admin, so there is always exactly one owner. */
export function transferOwnership(users: User[], actorId: string, targetId: string): Result {
  const actor = users.find((u) => u.id === actorId)
  const target = users.find((u) => u.id === targetId)
  if (!actor || actor.role !== 'owner') return fail('Only the owner can transfer ownership.')
  if (!target) return fail('That user no longer exists.')
  if (target.id === actor.id) return fail('Choose someone other than yourself.')
  if (target.status !== 'active') return fail('Ownership can only go to an active user.')
  return ok(replace(replace(users, actor.id, { role: 'admin' }), target.id, { role: 'owner' }))
}

/** Shape and invariant check for stored or restored data. */
export function validateUsers(value: unknown): value is User[] {
  if (!Array.isArray(value)) return false
  const str = (v: unknown) => typeof v === 'string' && v.length > 0
  const valid = value.every(
    (u) =>
      u && typeof u === 'object' && str(u.id) && str(u.name) && str(u.email) && str(u.createdAt) &&
      ROLES.includes(u.role) && ['active', 'invited', 'suspended'].includes(u.status),
  )
  if (!valid) return false
  const users = value as User[]
  const owners = users.filter((u) => u.role === 'owner')
  const emails = new Set(users.map((u) => normaliseEmail(u.email)))
  return owners.length === 1 && owners[0].status === 'active' && emails.size === users.length && new Set(users.map((u) => u.id)).size === users.length
}
