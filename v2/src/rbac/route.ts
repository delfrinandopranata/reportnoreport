export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' } | { page: 'workflows' } | { page: 'inbox' } | { page: 'records' }
  | { page: 'templates' } | { page: 'messages' } | { page: 'settings' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }
  | { page: 'workflow-edit' | 'workflow-access' | 'start' | 'task' | 'record' | 'template'; id: string }
export type Perms = { roles: boolean; forms: boolean; workflows: boolean; comms: boolean }

const ID = '([0-9a-f-]{36})'
const FORM_PAGE = new RegExp(`^#/forms/${ID}/(edit|fill|submissions)$`)
const WORKFLOW_PAGE = new RegExp(`^#/workflows/${ID}/(edit|access)$`)
const TEMPLATE_PAGE = new RegExp(`^#/templates/${ID}$`)
const ITEM_PAGE = new RegExp(`^#/(start|tasks|records)/${ID}$`)
const LISTS: Record<string, 'roles' | 'forms' | 'workflows' | 'inbox' | 'records' | 'templates' | 'messages' | 'settings'> = {
  '#/roles': 'roles', '#/forms': 'forms', '#/workflows': 'workflows', '#/inbox': 'inbox', '#/records': 'records',
  '#/templates': 'templates', '#/messages': 'messages', '#/settings': 'settings',
}
const ITEM = { start: 'start', tasks: 'task', records: 'record' } as const

export function parseRoute(hash: string): Route {
  if (Object.hasOwn(LISTS, hash)) return { page: LISTS[hash] }
  const f = FORM_PAGE.exec(hash)
  if (f) return { page: `form-${f[2]}` as 'form-edit' | 'form-fill' | 'form-submissions', id: f[1] }
  const w = WORKFLOW_PAGE.exec(hash)
  if (w) return { page: `workflow-${w[2]}` as 'workflow-edit' | 'workflow-access', id: w[1] }
  const i = ITEM_PAGE.exec(hash)
  if (i) return { page: ITEM[i[1] as keyof typeof ITEM], id: i[2] }
  const t = TEMPLATE_PAGE.exec(hash)
  if (t) return { page: 'template', id: t[1] }
  return { page: 'members' }
}

/** Pages the signed-in user may not see fall back to one they can. UI hint only; RLS and the Edge Functions decide. */
export function guardHash(hash: string, perms: Perms): string {
  const r = parseRoute(hash)
  if (r.page === 'roles' && !perms.roles) return '#/members'
  if (r.page === 'form-edit' && !perms.forms) return `#/forms/${r.id}/fill`
  if ((r.page === 'workflows' || r.page === 'workflow-edit' || r.page === 'workflow-access') && !perms.workflows) return '#/inbox'
  if ((r.page === 'templates' || r.page === 'template' || r.page === 'messages') && !perms.comms) return '#/inbox'
  return hash
}
