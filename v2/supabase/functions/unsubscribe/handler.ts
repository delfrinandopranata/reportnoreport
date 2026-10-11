import { checkUnsubscribe } from '../_shared/comms/campaign.ts'

export type UnsubscribeStore = {
  message(id: string): Promise<{ org_id: string; org_name: string; email: string } | null>
  isOptedOut(orgId: string, email: string): Promise<boolean>
  optOut(orgId: string, email: string): Promise<void>
}
export type Answer = { status: number; body: Record<string, unknown> }

const NOT_VALID = 'This unsubscribe link is not valid. Copy the whole link from the email and try again.'
const EXPIRED = 'This unsubscribe link has expired. Reply to the email and ask the sender to stop sending you campaigns.'

/**
 * JSON only: the page that asks lives on the public site. GET checks the link so the page can name the organisation;
 * POST unsubscribes. POST takes `{ t }` from the page, or RFC 8058's form body with the token in the URL (query).
 */
export async function handleUnsubscribe(method: string, queryToken: string | null, body: unknown, deps: { secret: string; store: UnsubscribeStore }): Promise<Answer> {
  if (method !== 'GET' && method !== 'POST') return { status: 405, body: { error: 'Open the unsubscribe link from the email.' } }
  const fromBody = body && typeof body === 'object' ? (body as { t?: unknown }).t : undefined
  const id = await checkUnsubscribe(deps.secret, method === 'POST' && fromBody !== undefined ? fromBody : queryToken)
  if (!id) return { status: 400, body: { error: NOT_VALID } }
  const m = await deps.store.message(id)
  if (!m) return { status: 404, body: { error: EXPIRED } }
  if (method === 'POST') {
    await deps.store.optOut(m.org_id, m.email)
    return { status: 200, body: { done: true, org: m.org_name } }
  }
  return { status: 200, body: { valid: true, org: m.org_name, already: await deps.store.isOptedOut(m.org_id, m.email) } }
}
