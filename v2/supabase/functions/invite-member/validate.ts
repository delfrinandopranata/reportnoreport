const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Invite = { orgId: string; email: string; roleIds: string[] }

export function validateInvite(body: unknown): { ok: true; value: Invite } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' }
  const { orgId, email, roleIds } = body as Record<string, unknown>
  if (typeof orgId !== 'string' || !UUID.test(orgId)) return { ok: false, error: 'Invalid organisation.' }
  if (typeof email !== 'string' || !EMAIL.test(email.trim())) return { ok: false, error: 'Enter a valid email address.' }
  if (!Array.isArray(roleIds) || roleIds.some((r) => typeof r !== 'string' || !UUID.test(r))) return { ok: false, error: 'Invalid roles.' }
  return { ok: true, value: { orgId, email: email.trim().toLowerCase(), roleIds: roleIds as string[] } }
}
