import { assertEquals } from 'jsr:@std/assert@1'
import postgres from 'npm:postgres@3.4.5'
import { PROBLEMS, sendCampaigns, type Deps } from './handler.ts'
import { TOO_BIG, checkUnsubscribe } from '../_shared/comms/campaign.ts'
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

/** n active members of a new role, emails sorted `bigNNNNNN-tag@big.test`, so a cut at a row count would drop the last ones. */
async function bigRole(sql: postgres.Sql, tag: string, n: number, optedOut: number): Promise<string> {
  const like = `big%-${tag}@big.test`
  const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Big ${tag}`}) returning id`
  await sql`insert into auth.users (id, email, instance_id, aud, role)
    select gen_random_uuid(), 'big' || lpad(g::text, 6, '0') || '-' || ${tag} || '@big.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
    from generate_series(1, ${n}) g`
  await sql`insert into members (org_id, user_id, email, status) select ${ALPHA}, id, email, 'active' from auth.users where email like ${like}`
  await sql`insert into member_roles (member_id, role_id) select id, ${role.id} from members where org_id = ${ALPHA} and email like ${like}`
  await sql`insert into email_optouts (org_id, email, reason)
    select ${ALPHA}, email, 'unsubscribe' from members where org_id = ${ALPHA} and email like ${like} order by email limit ${optedOut}`
  return role.id as string
}
async function dropBigRole(sql: postgres.Sql, tag: string) {
  const like = `big%-${tag}@big.test`
  await sql`delete from campaigns where name like ${`Big ${tag}%`}` // messages cascade
  await sql`delete from email_optouts where org_id = ${ALPHA} and email like ${like}`
  await sql`delete from members where org_id = ${ALPHA} and email like ${like}`
  await sql`delete from auth.users where email like ${like}`
  await sql`delete from roles where org_id = ${ALPHA} and name = ${`Big ${tag}`}`
}

Deno.test({
  name: 'real Postgres: the limit counts who is left after opt-outs, and nobody is cut (QA-P6-1)',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const deps: Deps = { authorised: true, store, now: () => new Date(), unsubscribe: UNSUB }
    const tag = crypto.randomUUID().slice(0, 8)
    const tag2 = crypto.randomUUID().slice(0, 8)
    try {
      // 10,002 members, 2 opted out: 10,000 are eligible, so all 10,000 are sent to and the 2 are counted.
      const fits = await bigRole(sql, tag, 10_002, 2)
      const id = await campaign(sql, `Big ${tag}`, { kind: 'role', roleId: fits }, ADMIN)
      await sendCampaigns(deps)
      const [row] = await sql`select status, recipients, excluded, error,
        (select count(*)::int from messages where campaign_id = c.id) as messages,
        (select count(*)::int from messages where campaign_id = c.id and recipient_email = ${`big010002-${tag}@big.test`}) as last_one
        from campaigns c where c.id = ${id}`
      assertEquals([row.status, row.recipients, row.excluded.unsubscribed, row.messages, row.last_one, row.error], ['sending', 10_000, 2, 10_000, 1, null])
      // 10,003 members, 2 opted out: 10,001 are eligible, which is over the limit, so it fails loudly and queues nothing.
      const over = await bigRole(sql, tag2, 10_003, 2)
      const id2 = await campaign(sql, `Big ${tag2}`, { kind: 'role', roleId: over }, ADMIN)
      await sendCampaigns(deps)
      const [bad] = await sql`select status, error, (select count(*)::int from messages where campaign_id = c.id) as messages from campaigns c where c.id = ${id2}`
      assertEquals([bad.status, bad.error, bad.messages], ['failed', TOO_BIG, 0])
    } finally {
      await dropBigRole(sql, tag)
      await dropBigRole(sql, tag2)
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: the set-based insert fills in each person\'s name, footer link and unsubscribe token',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      const [role] = await sql`insert into roles (org_id, name) values (${ALPHA}, ${`Render ${tag}`}) returning id`
      await sql`insert into auth.users (id, email, instance_id, aud, role) values
        (gen_random_uuid(), ${`r1-${tag}@render.test`}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
        (gen_random_uuid(), ${`r2-${tag}@render.test`}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`
      await sql`insert into members (org_id, user_id, email, full_name, status)
        select ${ALPHA}, id, email, case when email like 'r1-%' then 'A & <B>' else null end, 'active' from auth.users where email like ${`r_-${tag}@render.test`}`
      await sql`insert into member_roles (member_id, role_id) select id, ${role.id} from members where org_id = ${ALPHA} and email like ${`r_-${tag}@render.test`}`
      const [tpl] = await sql`insert into message_templates (org_id, name, subject, body) values (${ALPHA}, ${`Render ${tag}`}, 'Hi {{recipient.name}}', 'Hello {{recipient.name}}.

From {{org.name}} @@recipient-name@@') returning id`
      const [inApp] = await sql`insert into message_templates (org_id, name, channel, subject, body) values (${ALPHA}, ${`Render ${tag} app`}, 'in_app', 'Notice for {{recipient.name}}', 'Read {{recipient.name}}') returning id`
      const make = async (name: string, template: string) => (await sql`
        insert into campaigns (org_id, name, template_id, audience, status, scheduled_at, sent_by)
        values (${ALPHA}, ${name}, ${template}, ${sql.json({ kind: 'role', roleId: role.id })}, 'scheduled', now() - interval '1 minute', ${ADMIN}) returning id`)[0].id as string
      const mail = await make(`Render ${tag} mail`, tpl.id)
      const app = await make(`Render ${tag} app`, inApp.id)
      await sendCampaigns({ authorised: true, store, now: () => new Date(), unsubscribe: UNSUB })
      const rows = await sql`select id, recipient_email::text as email, status, subject, body_html, body_text, unsubscribe_url, sent_at from messages where campaign_id = ${mail} order by 2`
      assertEquals(rows.map((r) => [r.status, r.subject]), [['queued', 'Hi A & <B>'], ['queued', `Hi r2-${tag}@render.test`]])
      assertEquals(rows[0].body_html.includes('<p>Hello A &amp; &lt;B&gt;.</p>'), true) // escaped in html, raw in text
      assertEquals(rows[0].body_text.startsWith('Hello A & <B>.\n\nFrom Alpha'), true)
      for (const r of rows) {
        const fn = new URL(r.unsubscribe_url)
        assertEquals([fn.origin + fn.pathname, await checkUnsubscribe(UNSUB.secret, fn.searchParams.get('t'))], [UNSUB.url, r.id]) // the token the function verifies
        const page = `${UNSUB.page}?t=${fn.searchParams.get('t')}`
        assertEquals([r.body_text.endsWith(`campaign emails: ${page}`), r.body_html.includes(`<a href="${page}"`), r.body_text.includes('@@rnr-'), r.body_text.includes('@@recipient-name@@')], [true, true, false, true])
      }
      const apps = await sql`select recipient_user_id, status, channel, unsubscribe_url, sent_at is not null as sent, subject from messages where campaign_id = ${app} order by subject`
      assertEquals(apps.map((r) => [r.status, r.channel, r.unsubscribe_url, r.sent]), [['sent', 'in_app', null, true], ['sent', 'in_app', null, true]])
      const notices = await sql`select title, link, body from notifications where campaign_id = ${app} order by title`
      assertEquals(notices.map((n) => [n.title, n.link]), [['Notice for A & <B>', '#/inbox'], [`Notice for r2-${tag}@render.test`, '#/inbox']])
      assertEquals(notices.length, apps.filter((a) => a.recipient_user_id).length)
    } finally {
      await sql`delete from campaigns where name like ${`Render ${tag}%`}` // messages and notifications cascade
      await sql`delete from message_templates where name like ${`Render ${tag}%`}`
      await sql`delete from members where org_id = ${ALPHA} and email like ${`r_-${tag}@render.test`}`
      await sql`delete from auth.users where email like ${`r_-${tag}@render.test`}`
      await sql`delete from roles where org_id = ${ALPHA} and name = ${`Render ${tag}`}`
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: a leased campaign waits, and one whose runs were killed three times fails with a reason (QA-P6-3)',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      const audience = { kind: 'role', roleId: (await sql`select id from roles where org_id = ${ALPHA} and name = 'Member'`)[0].id }
      const leased = await campaign(sql, `Lease ${tag} held`, audience, ADMIN)
      const killed = await campaign(sql, `Lease ${tag} killed`, audience, ADMIN)
      const retried = await campaign(sql, `Lease ${tag} retried`, audience, ADMIN)
      await sql`update campaigns set attempts = 1, claimed_until = now() + interval '3 minutes' where id = ${leased}`
      await sql`update campaigns set attempts = 3, claimed_until = now() - interval '1 minute' where id = ${killed}`
      await sql`update campaigns set attempts = 2, claimed_until = now() - interval '1 minute' where id = ${retried}`
      await sendCampaigns({ authorised: true, store, now: () => new Date(), unsubscribe: UNSUB })
      const read = async (id: string) => (await sql`select status, attempts, error from campaigns where id = ${id}`)[0]
      assertEquals(await read(leased), { status: 'scheduled', attempts: 1, error: null })
      assertEquals(await read(killed), { status: 'failed', attempts: 4, error: PROBLEMS.attempts })
      assertEquals((await read(retried)).status, 'sending')
      assertEquals((await read(retried)).attempts, 3)
    } finally {
      await sql`delete from campaigns where name like ${`Lease ${tag}%`}`
      await store.end()
      await sql.end()
    }
  },
})

Deno.test({
  name: 'real Postgres: the follow-up reaches exactly the people campaign_stats.not_opened counts (QA-P6-5)',
  ignore: !url,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sql = postgres(url!, { max: 1 })
    const store = pgCampaignStore(url!)
    const tag = crypto.randomUUID().slice(0, 8)
    try {
      const parent = await campaign(sql, `Follow ${tag} parent`, { kind: 'role', roleId: (await sql`select id from roles where org_id = ${ALPHA} and name = 'Member'`)[0].id }, ADMIN)
      await sql`update campaigns set status = 'sent', audience_snapshot_at = now() where id = ${parent}`
      const at = (e: string, status: string, over: Record<string, string | null> = {}) => sql`
        insert into messages (org_id, campaign_id, recipient_email, subject, body_html, body_text, status, opened_at, bounced_at, complained_at)
        values (${ALPHA}, ${parent}, ${`${e}-${tag}@follow.test`}, 'Hi', 'x', 'x', ${status}, ${over.opened ?? null}, ${over.bounced ?? null}, ${over.complained ?? null})`
      const now = new Date().toISOString()
      await at('unopened', 'sent')
      await at('opened', 'sent', { opened: now })
      await at('bounced', 'sent', { bounced: now })
      await at('complained', 'sent', { complained: now })
      await at('both', 'sent', { opened: now, complained: now })
      await at('queued', 'queued')
      await at('failed', 'failed')
      const child = await campaign(sql, `Follow ${tag} child`, { kind: 'followup', campaignId: parent, who: 'not_opened' }, ADMIN)
      await sendCampaigns({ authorised: true, store, now: () => new Date(), unsubscribe: UNSUB })
      const reached = (await sql`select recipient_email::text as e from messages where campaign_id = ${child}`).map((r) => r.e)
      assertEquals(reached, [`unopened-${tag}@follow.test`])
      const [stats] = await sql`select not_opened from campaign_stats(${ALPHA}) where campaign_id = ${parent}`
      assertEquals(stats.not_opened, reached.length)
    } finally {
      await sql`delete from campaigns where name like ${`Follow ${tag}%`}`
      await store.end()
      await sql.end()
    }
  },
})
