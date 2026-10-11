import postgres from 'npm:postgres@3.4.5'
import type { Person } from '../_shared/comms/campaign.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'
import { NOT_OPENED } from '../_shared/comms/followup.ts'
import type { CampaignRow, CampaignStore, CampaignTx, SenderReads } from './store.ts'

const NIL = '00000000-0000-0000-0000-000000000000'
const PAGE = 1000

/** Connects as `postgres`; asSender switches to the authenticated role with the sender's claims so RLS applies to those reads. */
export function pgCampaignStore(url: string): CampaignStore & { end(): Promise<void> } {
  const sql = postgres(url, { max: 2, prepare: false, onnotice: () => {} })
  return {
    tx: <T>(fn: (tx: CampaignTx) => Promise<T>) => sql.begin((t) => fn(campaignTx(t))) as Promise<T>,
    end: () => sql.end(),
  }
}

function campaignTx(t: postgres.TransactionSql): CampaignTx {
  // Built from the shared definition, so the follow-up, the recipient list and campaign_stats.not_opened cannot drift apart.
  const notOpened = NOT_OPENED.map(([op, col, v]) => (op === 'eq' ? t`${t(col)} = ${v}` : t`${t(col)} is null`))
    .reduce((a, b) => t`${a} and ${b}`)
  const one = async <R>(q: Promise<readonly unknown[]>) => ((await q)[0] as R | undefined) ?? null
  const person = t`m.user_id as "userId", m.email::text as email, coalesce(nullif(btrim(m.full_name), ''), m.email::text) as name`
  const rows = (r: unknown) => r as Record<string, postgres.ParameterOrJSON<never>>[]
  return {
    dueCampaigns: async (now, limit) =>
      (await t`select id from campaigns where status = 'scheduled' and scheduled_at <= ${now} and (claimed_until is null or claimed_until <= ${now})
        order by scheduled_at limit ${limit}`).map((r) => r.id as string),
    startAttempt: async (id, now, leaseUntil) => (await one<{ attempts: number }>(t`
      update campaigns set attempts = attempts + 1, claimed_until = ${leaseUntil}
      where id = ${id} and status = 'scheduled' and scheduled_at <= ${now} and (claimed_until is null or claimed_until <= ${now})
      returning attempts`))?.attempts ?? null,
    // The row lock makes a concurrent run wait here, then find the status changed and get no row (decision 3).
    claim: (id, now) => one<CampaignRow>(t`
      update campaigns set status = 'sending' where id = ${id} and status = 'scheduled' and scheduled_at <= ${now}
      returning id, org_id, name, template_id, audience, sent_by`),
    asSender: async (userId, fn) => {
      await t`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
      await t`set local role authenticated`
      try {
        return await fn(senderReads(t))
      } finally {
        // After a SQL error the transaction is already aborting and RESET fails; the rollback restores the role anyway.
        await t`reset role`.catch(() => undefined)
      }
    },
    template: (org, id) => one<TemplateRow>(t`select id, org_id, kind, name, channel, subject, body from message_templates where id = ${id} and org_id = ${org}`),
    orgName: async (org) => (await one<{ name: string }>(t`select name from orgs where id = ${org}`))?.name ?? '',
    roleExists: async (org, role) => (await t`select 1 from roles where id = ${role} and org_id = ${org}`).length > 0,
    roleEligible: async (org, role) => (await t`
      select count(distinct lower(m.email::text))::int as n from members m join member_roles mr on mr.member_id = m.id
      where m.org_id = ${org} and m.status = 'active' and mr.role_id = ${role}
        and not exists (select 1 from email_optouts o where o.org_id = m.org_id and o.email = m.email)`)[0].n as number,
    roleMembers: async (org, role) => [...await t<Person[]>`
      select ${person} from members m join member_roles mr on mr.member_id = m.id
      where m.org_id = ${org} and m.status = 'active' and mr.role_id = ${role} order by m.email`],
    peopleByIds: async (org, ids) => (ids.length
      ? [...await t<Person[]>`select ${person} from members m where m.org_id = ${org} and m.status = 'active' and m.user_id in ${t(ids)} order by m.email`]
      : []),
    parent: (org, id) => one<{ status: string; linked_workflow_id: string | null }>(t`select status, linked_workflow_id from campaigns where id = ${id} and org_id = ${org}`),
    parentRecipients: async (org, id, who) => [...(who === 'not_opened'
      ? await t<{ userId: string | null; email: string }[]>`
          select recipient_user_id as "userId", recipient_email::text as email from messages
          where campaign_id = ${id} and org_id = ${org} and ${notOpened}`
      : await t<{ userId: string | null; email: string }[]>`
          select m.recipient_user_id as "userId", m.recipient_email::text as email from messages m join campaigns c on c.id = m.campaign_id
          where m.campaign_id = ${id} and m.org_id = ${org} and m.recipient_user_id is not null and m.status = 'sent'
            and not exists (select 1 from records r where r.workflow_id = c.linked_workflow_id and r.started_by = m.recipient_user_id
                            and r.created_at >= c.audience_snapshot_at and r.status = 'done')`)],
    optedOut: async (org, emails) => new Set(emails.length
      ? (await t`select lower(email::text) as e from email_optouts where org_id = ${org} and email in ${t(emails)}`).map((r) => r.e as string)
      : []),
    // The whole audience in one statement: ids, unsubscribe tokens (HMAC-SHA256, the same as unsubscribeLink), names and
    // links are made by the database, so the function does no per-person work (QA-P6-3).
    queueAudience: async (q) => {
      const email = q.channel === 'email'
      const esc = t`replace(replace(replace(replace(replace(p.name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')`
      const link = t`${q.unsubscribe.page} || '?t=' || p.id || '.' || p.sig`
      const made = await t`
        with src as (
          select gen_random_uuid() as id, r."userId", r.email, regexp_replace(r.name, '[\r\n\t]+', ' ', 'g') as name
          from jsonb_to_recordset(${t.json(q.list as never)}) as r("userId" uuid, email text, name text)
        ), p as (
          select src.*, rtrim(translate(encode(extensions.hmac('unsubscribe:' || src.id::text, ${q.unsubscribe.secret}, 'sha256'), 'base64'), '+/', '-_'), '=') as sig
          from src
        )
        insert into messages (id, org_id, campaign_id, template_id, recipient_user_id, recipient_email, channel, status, subject, body_html, body_text, unsubscribe_url, sent_at)
        select p.id, ${q.orgId}, ${q.campaignId}, ${q.templateId}, p."userId", p.email, ${q.channel}, ${email ? 'queued' : 'sent'},
          left(btrim(replace(${q.subject}, ${q.nameToken}, p.name)), 200),
          replace(replace(${q.html}, ${q.nameToken}, ${esc}), ${q.linkToken}, ${link}),
          replace(replace(${q.text}, ${q.nameToken}, p.name), ${q.linkToken}, ${link}),
          ${email ? t`${q.unsubscribe.url} || '?t=' || p.id || '.' || p.sig` : null}, ${email ? null : q.now}
        from p returning id`
      if (made.length !== q.list.length) throw new Error('The audience was not queued completely.') // rolls the transaction back
      if (!email) {
        await t`insert into notifications (org_id, user_id, campaign_id, kind, title, body, link)
          select org_id, recipient_user_id, campaign_id, 'campaign', subject, left(body_text, 2000), '#/inbox'
          from messages where campaign_id = ${q.campaignId} and recipient_user_id is not null`
      }
    },
    finish: async (id, f) => {
      await t`update campaigns set status = ${f.status}, recipients = ${f.recipients}, excluded = ${t.json(f.excluded)}, channel = ${f.channel},
        audience_snapshot_at = ${f.at}, finished_at = ${f.status === 'sent' ? f.at : null} where id = ${id}`
    },
    fail: async (id, error) => (await t`update campaigns set status = 'failed', error = ${error} where id = ${id} and status = 'scheduled' returning id`).length === 1,
  }
}

function senderReads(t: postgres.TransactionSql): SenderReads {
  return {
    can: async (org, perm, wf) => (wf
      ? await t`select has_permission(${org}::uuid, ${perm}, ${wf}::uuid) as ok`
      : await t`select has_permission(${org}::uuid, ${perm}) as ok`)[0].ok === true,
    savedReport: async (id, org) => ((await t`
      select name, workflow_id, columns, filters, group_by, aggregate from saved_reports where id = ${id} and org_id = ${org}`)[0] as SavedRow | undefined) ?? null,
    // Keyset by id, like run-report's callerSource; RLS (records_read) filters every page.
    async *records(org, wf) {
      let last = NIL
      for (;;) {
        const page = await t`
          select id, title, status, label, current_node_id, started_by, created_at::text as created_at, updated_at::text as updated_at, data
          from records where org_id = ${org} and workflow_id = ${wf} and id > ${last} order by id limit ${PAGE}`
        yield page as unknown as ReportRecord[]
        if (page.length < PAGE) return
        last = page[page.length - 1].id as string
      }
    },
  }
}
