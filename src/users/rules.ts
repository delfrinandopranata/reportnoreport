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

export const normaliseEmail = (email: string) => email.trim().toLowerCase()
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

/** The owner row is never managed directly: ownership only moves via transferOwnership. */
export function canManageUser(actor: User, target: User): boolean {
  return can(actor.role, 'users.manage') && actor.id !== target.id && target.role !== 'owner'
}
