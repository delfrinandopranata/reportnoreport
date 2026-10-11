import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { PROBLEMS, sendCampaigns, type Deps } from './handler.ts'
import { pgCampaignStore } from './pgStore.ts'
import { pgStore } from '../advance/pgStore.ts'
import { sendMessages } from '../send-messages/handler.ts'
import { ADMIN, MEMBER, WF } from '../_shared/workflow/fixture.ts'

const url = Deno.permissions.querySync({ name: 'env', variable: 'RNR_TEST_DB_URL' }).state === 'granted'
  ? Deno.env.get('RNR_TEST_DB_URL')
  : undefined
const ALPHA = '0000000a-0000-0000-0000-000000000001'
const VIEWER = '00000000-0000-0000-0000-0000000000a4'
const UNSUB = { url: 'http://127.0.0.1:54321/functions/v1/unsubscribe', page: 'http://127.0.0.1:5173/unsubscribe', secret: 'a-local-unsubscribe-secret-of-32+chars' }

async function campaign(sql: postgres.Sql, name: string, audience: unknown, sentBy: string): Promise<string> {
  const [c] = await sql`
    insert into campaigns (org_id, name, template_id, audience, status, scheduled_at, sent_by)
    values (${ALPHA}, ${name}, (select id from message_templates where org_id = ${ALPHA} and kind = 'record_approved'),
            ${sql.json(audience as postgres.JSONValue)}, 'scheduled', now() - interval '1 minute', ${sentBy})
    returning id`
  return c.id as string
}

Deno.test({
  name: 'real Postgres: two overlapping runs send a campaign once',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      // 1,200 people, so the insert spans two chunks
      const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Bulk ${tag}`}) returning id`
      await sql`insert into auth.users (id, email, instance_id, aud, role)
        select gen_random_uuid(), 'bulk' || g || '-' || ${tag} || '@bulk.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
        from generate_series(1, 1200) g`
      await sql`insert into members (org_id, user_id, email, status)
        select ${ALPHA}, id, email, 'active' from auth.users where email like ${`bulk%-${tag}@bulk.test`}`
      await sql`insert into member_roles (member_id, role_id) select id, ${role.id} from members where org_id = ${ALPHA} and email like ${`bulk%-${tag}@bulk.test`}`
      const id = await campaign(sql, `Bulk ${tag}`, { kind: 'role', roleId: role.id }, ADMIN)
      const deps: Deps = { authorised: true, store, now: () => new Date(), unsubscribe: UNSUB }
      const [a, b] = await Promise.all([sendCampaigns(deps), sendCampaigns(deps)])
      const started = [a, b].map((r) => (r.body as { started: number }).started).sort()
      const [row] = await sql`select c.status, c.recipients,
        (select count(*)::int from messages where campaign_id = c.id) as messages,
        (select count(distinct recipient_email)::int from messages where campaign_id = c.id) as addresses,
        (select count(*)::int from messages where campaign_id = c.id and unsubscribe_url is not null) as links
        from campaigns c where c.id = ${id}`
      assertEquals([started, row.status, row.recipients, row.messages, row.addresses, row.links], [[0, 1], 'sending', 1200, 1200, 1200, 1200])
    } finally {
      await sql`delete from campaigns where name = ${`Bulk ${tag}`}` // messages cascade
      await sql`delete from members where org_id = ${ALPHA} and email like ${`bulk%-${tag}@bulk.test`}` // member_roles cascade
      await sql`delete from auth.users where email like ${`bulk%-${tag}@bulk.test`}`
      await sql`delete from roles where org_id = ${ALPHA} and name = ${`Bulk ${tag}`}`
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: a report audience is read with the sender\'s visibility',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      // The member may broadcast and view reports, but sees only the records they started.
      const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Broadcast ${tag}`}) returning id`
      await sql`insert into role_permissions values (${role.id}, 'comms.broadcast')`
      await sql`insert into member_roles select id, ${role.id} from members where org_id = ${ALPHA} and user_id = ${MEMBER}`
      await sql`insert into records (org_id, workflow_id, title, current_node_id, data, started_by) values
        (${ALPHA}, ${WF}, 'Audience member', null, ${sql.json({ tag })}, ${MEMBER}),
        (${ALPHA}, ${WF}, 'Audience admin', null, ${sql.json({ tag })}, ${ADMIN})`
      const [report] = await sql`insert into saved_reports (org_id, workflow_id, name, columns, filters)
        values (${ALPHA}, ${WF}, ${`Audience ${tag}`}, ${sql.json([{ meta: 'title' }])}, ${sql.json([{ field: 'tag', operator: 'is', value: tag }])}) returning id`
      const audience = { kind: 'report', reportId: report.id, to: 'starter' }
      const asMember = await campaign(sql, `Audience ${tag} member`, audience, MEMBER)
      const asAdmin = await campaign(sql, `Audience ${tag} admin`, audience, ADMIN)
      const asViewer = await campaign(sql, `Audience ${tag} viewer`, audience, VIEWER)
      await sendCampaigns({ authorised: true, store, now: () => new Date(), unsubscribe: UNSUB })
      const to = async (id: string) => (await sql`select recipient_email::text as e from messages where campaign_id = ${id} order by 1`).map((r) => r.e)
      assertEquals(await to(asMember), ['member@alpha.test'])
      assertEquals(await to(asAdmin), ['admin@alpha.test', 'member@alpha.test'])
      const [v] = await sql`select status, error from campaigns where id = ${asViewer}`
      assertEquals([v.status, v.error, (await to(asViewer)).length], ['failed', PROBLEMS.senderLost, 0])
    } finally {
      await sql`delete from campaigns where name like ${`Audience ${tag}%`}`
      await sql`delete from saved_reports where name = ${`Audience ${tag}`}`
      await sql`delete from records where data->>'tag' = ${tag}`
      await sql`delete from roles where org_id = ${ALPHA} and name = ${`Broadcast ${tag}`}` // member_roles and role_permissions cascade
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: a campaign moves sending to sent when its last email leaves the queue',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const mail = pgStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Drain ${tag}`}) returning id`
      await sql`insert into member_roles select id, ${role.id} from members where org_id = ${ALPHA} and user_id in (${ADMIN}, ${MEMBER})`
      const id = await campaign(sql, `Drain ${tag}`, { kind: 'role', roleId: role.id }, ADMIN)
      await sendCampaigns({ authorised: true, store, now: () => new Date(), unsubscribe: UNSUB })
      // Other queued mail in the shared test database must not decide this campaign's state, so check it before and after.
      const status = async () => (await sql`select status, finished_at is not null as done from campaigns where id = ${id}`)[0]
      assertEquals(await status(), { status: 'sending', done: false })
      const sentTo: string[] = []
      const transport = { send: (m: { to: string }) => (sentTo.push(m.to), Promise.resolve({ ok: true as const, providerId: null })) }
      const res = await sendMessages({ authorised: true, store: mail, transport, now: () => new Date(), appUrl: 'http://localhost:5173/app/' })
      assertEquals(['admin@alpha.test', 'member@alpha.test'].map((e) => sentTo.includes(e)), [true, true])
      assertEquals([(res.body as { campaigns: number }).campaigns >= 1, await status()], [true, { status: 'sent', done: true }])
    } finally {
      await sql`delete from campaigns where name = ${`Drain ${tag}`}` // messages cascade
      await sql`delete from roles where org_id = ${ALPHA} and name = ${`Drain ${tag}`}`
      await mail.end()
      await store.end()
      await sql.end()
    }
  },
})
