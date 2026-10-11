import { can, type Role } from './users/rules.ts'

export type View = 'dashboard' | 'clients' | 'contracts' | 'users' | 'settings'
export type NavItem = { view: View; label: string; short: string; icon: 'dashboard' | 'users' | 'file' | 'user' | 'sliders'; place: 'main' | 'foot' }

const ALL: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'dashboard', place: 'main' },
  { view: 'clients', label: 'Clients', short: 'Clients', icon: 'users', place: 'main' },
  { view: 'contracts', label: 'Contract Manager', short: 'Contracts', icon: 'file', place: 'main' },
  { view: 'users', label: 'Users', short: 'Users', icon: 'user', place: 'foot' },
  { view: 'settings', label: 'Settings', short: 'Settings', icon: 'sliders', place: 'foot' },
]

/** The pages a role can open, in sidebar order. Users needs users.manage, as the account menu did before. */
export const navItems = (role: Role): NavItem[] => ALL.filter((i) => i.view !== 'users' || can(role, 'users.manage'))

/** The phone bottom bar: the main pages; "Menu" (rendered by the shell) opens the rest. */
export const phoneItems = (items: NavItem[]): NavItem[] => items.filter((i) => i.place === 'main')

/** Billing is a sub-page of Settings, so the Settings item stays current there. */
export const currentItem = (view: View | 'billing'): View => (view === 'billing' ? 'settings' : view)
