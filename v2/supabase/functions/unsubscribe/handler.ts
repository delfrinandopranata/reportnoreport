import { checkUnsubscribe } from '../_shared/comms/campaign.ts'
import { escapeHtml } from '../_shared/comms/render.ts'

export type UnsubscribeStore = {
  message(id: string): Promise<{ org_id: string; org_name: string; email: string } | null>
  isOptedOut(orgId: string, email: string): Promise<boolean>
  optOut(orgId: string, email: string): Promise<void>
}
export type Page = { status: number; html: string }

const page = (status: number, title: string, body: string): Page => ({
  status,
  html: `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`,
})

/** GET asks, POST does: link scanners fetch every URL in an email, so only the button (or a one-click POST) unsubscribes. */
export async function handleUnsubscribe(method: string, url: URL, deps: { secret: string; store: UnsubscribeStore }): Promise<Page> {
  if (method !== 'GET' && method !== 'POST') return page(405, 'Not available', '<p>Open the unsubscribe link from the email.</p>')
  const id = url.searchParams.get('m')
  if (!(await checkUnsubscribe(deps.secret, id, url.searchParams.get('t')))) {
    return page(400, 'This link is not valid', '<p>The unsubscribe link is incomplete. Copy the whole link from the email and try again.</p>')
  }
  const m = await deps.store.message(id as string)
  if (!m) return page(404, 'This link has expired', '<p>Reply to the email and ask the sender to stop sending you campaigns.</p>')
  const org = escapeHtml(m.org_name)
  if (method === 'POST') {
    await deps.store.optOut(m.org_id, m.email)
    return page(200, 'Unsubscribed', `<p>You are unsubscribed from ${org} campaign emails. Emails about your own tasks and records still arrive.</p>`)
  }
  if (await deps.store.isOptedOut(m.org_id, m.email)) {
    return page(200, 'Unsubscribed', `<p>You are already unsubscribed from ${org} campaign emails.</p>`)
  }
  return page(200, 'Unsubscribe', `<p>Stop receiving campaign emails from ${org}? Emails about your own tasks and records still arrive.</p>`
    + '<form method="post"><button type="submit">Unsubscribe</button></form>')
}
