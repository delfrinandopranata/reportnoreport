import type { Route } from '../rbac/route'

export type NavIcon = 'inbox' | 'records' | 'dashboard' | 'reports' | 'forms' | 'workflows' | 'templates' | 'campaigns' | 'members' | 'roles' | 'messages'
export type NavPerms = { reports: boolean; workflows: boolean; comms: boolean; broadcast: boolean; roles: boolean }
export type NavItem = { href: string; label: string; icon: NavIcon; current: boolean }
export type NavGroup = { label: 'Work' | 'Build' | 'Admin'; items: NavItem[] }

/** The sidebar. Visibility is exactly the old header's (App.tsx before Phase 7); nav.test.ts pins it. */
export function navGroups(page: Route['page'], p: NavPerms): NavGroup[] {
  const item = (show: boolean, href: string, label: string, icon: NavIcon, current: boolean): NavItem[] =>
    show ? [{ href, label, icon, current }] : []
  return [
    { label: 'Work', items: [
      ...item(true, '#/inbox', 'Inbox', 'inbox', page === 'inbox' || page === 'start' || page === 'task'),
      ...item(true, '#/records', 'Records', 'records', page === 'records' || page === 'record'),
      ...item(p.reports, '#/dashboard', 'Dashboard', 'dashboard', page === 'dashboard'),
      ...item(p.reports, '#/reports', 'Reports', 'reports', page === 'reports' || page === 'report'),
    ] },
    { label: 'Build', items: [
      ...item(true, '#/forms', 'Forms', 'forms', page.startsWith('form')),
      ...item(p.workflows, '#/workflows', 'Workflows', 'workflows', page.startsWith('workflow')),
      ...item(p.comms, '#/templates', 'Templates', 'templates', page === 'templates' || page === 'template'),
      ...item(p.broadcast, '#/campaigns', 'Campaigns', 'campaigns', page === 'campaigns' || page === 'campaign'),
    ] },
    { label: 'Admin', items: [
      ...item(true, '#/members', 'Members', 'members', page === 'members'),
      ...item(p.roles, '#/roles', 'Roles', 'roles', page === 'roles'),
      ...item(p.comms, '#/messages', 'Messages', 'messages', page === 'messages'),
    ] },
  ]
}

export const phoneItems = (groups: NavGroup[]) => groups.flatMap((g) => g.items).slice(0, 4)

export const jumpItems = (groups: NavGroup[]) =>
  [...groups.flatMap((g) => g.items.map(({ href, label }) => ({ href, label }))), { href: '#/settings', label: 'Settings' }]

export const matchJump = (items: { href: string; label: string }[], query: string) => {
  const q = query.trim().toLowerCase()
  return items.filter((i) => i.label.toLowerCase().includes(q))
}
