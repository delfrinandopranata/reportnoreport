import type { Audience, RecipientRow, Stats } from './logic.ts'

export type AudienceNames = {
  roles: Map<string, string>; reports: Map<string, string>; campaigns: Map<string, string>
  fields: Map<string, string>; workflow: string | null
}
/** One sentence naming who a campaign is for, shared by the review dialog, the scheduled summary and the report. */
export function audienceText(a: Audience | null, n: AudienceNames): string {
  if (!a) return 'Nobody chosen yet'
  if (a.kind === 'role') return `Role: ${n.roles.get(a.roleId) ?? 'a role that no longer exists'}`
  if (a.kind === 'report') {
    const report = n.reports.get(a.reportId) ?? 'a report you cannot see'
    return a.to === 'starter' ? `Report: ${report}, to the person who started each record` : `Report: ${report}, to the address in ${n.fields.get(a.to.field) ?? a.to.field}`
  }
  const campaign = n.campaigns.get(a.campaignId) ?? 'the earlier campaign'
  return a.who === 'not_opened' ? `Follow-up: people who did not open ${campaign}` : `Follow-up: people who have not finished ${n.workflow ?? 'the linked workflow'}`
}

export const channelWord = (c: 'email' | 'in_app' | null) => (c === 'in_app' ? 'In-app notice' : 'Email')

/** A bounced email keeps status 'sent' in the table but reads as its own word. */
export const recipientStatus = (r: RecipientRow): 'queued' | 'sent' | 'failed' | 'bounced' =>
  r.bounced_at ? 'bounced' : (r.status === 'queued' || r.status === 'failed' ? r.status : 'sent')

/** Whoever was sent to and has neither opened nor bounced; the exact list is taken when the follow-up is sent. */
export const notOpenedCount = (s: Stats) => Math.max(0, s.sent - s.opened - s.bounced)
