import { assertEquals } from 'jsr:@std/assert@1'
import { inviteMessage } from './message.ts'

const T = { id: '0000000a-0000-0000-0000-00000000a0e4', subject: 'You are invited to join {{org.name}}', body: 'Join {{org.name}}: {{link.invite}}' }
const APP = 'http://localhost:5173/app/'

Deno.test('the invite links to the app sign-in page and carries no token', () => {
  const m = inviteMessage(T, { orgId: 'org-1', orgName: 'Alpha School', email: 'new@alpha.test', appUrl: APP })
  assertEquals(m, {
    org_id: 'org-1', template_id: T.id, record_id: null, recipient_user_id: null, recipient_email: 'new@alpha.test',
    subject: 'You are invited to join Alpha School',
    body_html: `<p>Join Alpha School: <a href="${APP}">${APP}</a></p>`,
    body_text: `Join Alpha School: ${APP}`,
  })
})
Deno.test('the org name in an invite is escaped', () => {
  const m = inviteMessage(T, { orgId: 'org-1', orgName: '<img src=x onerror=alert(1)> & Co', email: 'new@alpha.test', appUrl: APP })
  assertEquals(m.body_html, `<p>Join &lt;img src=x onerror=alert(1)&gt; &amp; Co: <a href="${APP}">${APP}</a></p>`)
  assertEquals(m.subject, 'You are invited to join <img src=x onerror=alert(1)> & Co')
})
