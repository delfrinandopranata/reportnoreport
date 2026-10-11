export const PERMISSION_GROUPS = [
  { group: 'Forms', items: [{ key: 'forms.manage', label: 'Create and edit forms' }] },
  { group: 'Workflows', items: [
    { key: 'workflows.manage', label: 'Create and edit workflows' },
    { key: 'workflows.publish', label: 'Publish workflows' },
  ] },
  { group: 'Records', items: [
    { key: 'records.view_all', label: 'View all records' },
    { key: 'records.start', label: 'Start records' },
  ] },
  { group: 'Reports', items: [
    { key: 'reports.view', label: 'View reports' },
    { key: 'reports.manage', label: 'Create and edit reports' },
  ] },
  { group: 'Comms', items: [
    { key: 'comms.manage', label: 'Manage message templates' },
    { key: 'comms.broadcast', label: 'Send campaigns' },
  ] },
  { group: 'Admin', items: [
    { key: 'members.manage', label: 'Invite and manage members' },
    { key: 'roles.manage', label: 'Manage roles and permissions' },
  ] },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number]['key']
export const PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))

/** UI hint only — the database decides. */
export const can = (held: ReadonlySet<string>, perm: Permission) => held.has(perm)
