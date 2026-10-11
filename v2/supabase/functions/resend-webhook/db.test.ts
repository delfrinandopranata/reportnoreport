import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { pgApply } from './pgApply.ts'
import { TRACKING } from '../_shared/comms/webhook.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined
const ALPHA = '0000000a-0000-0000-0000-000000000001'

Deno.test({
  name: 'real Postgres: a replayed event changes nothing and an older one keeps the earliest time',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const tag = crypto.randomUUID().slice(0, 8)
    const providerId = `rs_test_${tag}`
    const email = `hook-${tag}@example.test`
    try {
      await sql`insert into messages (org_id, recipient_email, subject, body_html, body_text, status, provider_id, sent_at)
        values (${ALPHA}, ${email}, 'Hi', '<p>Hi</p>', 'Hi', 'sent', ${providerId}, now())`
      const apply = pgApply(sql)
      const t2 = new Date('2026-10-11T12:00:00Z')
      const t1 = new Date('2026-10-11T11:00:00Z')
      const read = async () => (await sql`select delivered_at, opened_at, clicked_at from messages where provider_id = ${providerId}`)[0]
      assertEquals(await apply({ providerId, columns: TRACKING['email.opened'], at: t2, complaint: false }), true)
      assertEquals(await apply({ providerId, columns: TRACKING['email.opened'], at: t2, complaint: false }), true) // replay
      let row = await read()
      assertEquals([row.delivered_at.toISOString(), row.opened_at.toISOString(), row.clicked_at], [t2.toISOString(), t2.toISOString(), null])
      await apply({ providerId, columns: TRACKING['email.opened'], at: t1, complaint: false }) // an older retry arrives late
      row = await read()
      assertEquals([row.delivered_at.toISOString(), row.opened_at.toISOString()], [t1.toISOString(), t1.toISOString()])
      await apply({ providerId, columns: TRACKING['email.complained'], at: t2, complaint: true })
      assertEquals((await sql`select reason from email_optouts where org_id = ${ALPHA} and email = ${email}`).map((r) => r.reason), ['complaint'])
      assertEquals(await apply({ providerId: `rs_missing_${tag}`, columns: TRACKING['email.delivered'], at: t2, complaint: false }), false)
    } finally {
      await sql`delete from email_optouts where org_id = ${ALPHA} and email = ${email}`
      await sql`delete from messages where provider_id = ${providerId}`
      await sql.end()
    }
  },
})
