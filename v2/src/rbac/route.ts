export type Route =
  | { page: 'members' } | { page: 'roles' } | { page: 'forms' }
  | { page: 'form-edit' | 'form-fill' | 'form-submissions'; id: string }

const FORM_PAGE = /^#\/forms\/([0-9a-f-]{36})\/(edit|fill|submissions)$/

export function parseRoute(hash: string): Route {
  if (hash === '#/roles') return { page: 'roles' }
  if (hash === '#/forms') return { page: 'forms' }
  const m = FORM_PAGE.exec(hash)
  if (m) return { page: `form-${m[2]}` as 'form-edit' | 'form-fill' | 'form-submissions', id: m[1] }
  return { page: 'members' }
}

/** Pages the signed-in user may not see fall back to one they can. UI hint only; RLS decides. */
export function guardHash(hash: string, perms: { roles: boolean; forms: boolean }): string {
  const r = parseRoute(hash)
  if (r.page === 'roles' && !perms.roles) return '#/members'
  if (r.page === 'form-edit' && !perms.forms) return `#/forms/${r.id}/fill`
  return hash
}
