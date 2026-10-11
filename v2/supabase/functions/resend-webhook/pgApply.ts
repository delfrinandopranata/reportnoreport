import type postgres from 'npm:postgres@3.4.5'
import type { TrackingEvent } from '../_shared/comms/webhook.ts'

/** The earliest time wins, so a replay or a late retry changes nothing (decision 6). A complaint also opts the address out. */
export function pgApply(sql: postgres.Sql) {
  return (e: TrackingEvent) => sql.begin(async (t) => {
    let hit: { org_id: string; recipient_email: string } | undefined
    for (const col of e.columns) {
      const [row] = await t<{ org_id: string; recipient_email: string }[]>`
        update messages set ${t(col)} = least(coalesce(${t(col)}, ${e.at}::timestamptz), ${e.at}::timestamptz)
        where provider_id = ${e.providerId} returning org_id, recipient_email::text as recipient_email`
      hit ??= row
    }
    if (hit && e.complaint) {
      await t`insert into email_optouts (org_id, email, reason) values (${hit.org_id}, ${hit.recipient_email}, 'complaint') on conflict do nothing`
    }
    return !!hit
  }) as Promise<boolean>
}
