import { render } from '../_shared/comms/render.ts'
import type { NewMessage } from '../advance/notify.ts'

/**
 * The "Invite to org" email. It links to the app's sign-in page: signing in or signing up with the invited address runs
 * accept_invites(), so no auth token is stored in `messages`, which every comms.manage holder can read.
 */
export function inviteMessage(t: { id: string; subject: string; body: string }, input: { orgId: string; orgName: string; email: string; appUrl: string }): NewMessage {
  const r = render(t, {
    record: { title: '', data: {} },
    step: { assignee: { name: '' } },
    link: { task: '', record: '', invite: input.appUrl },
    org: { name: input.orgName },
    recipient: { name: input.email },
  })
  return {
    org_id: input.orgId, template_id: t.id, record_id: null, recipient_user_id: null, recipient_email: input.email,
    subject: r.subject || 'You are invited', body_html: r.html, body_text: r.text,
  }
}
