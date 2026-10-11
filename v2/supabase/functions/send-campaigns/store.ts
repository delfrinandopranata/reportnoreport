import type { Excluded, FollowupWho, Person } from '../_shared/comms/campaign.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'

export type CampaignRow = { id: string; org_id: string; name: string; template_id: string | null; audience: unknown; sent_by: string | null }
export type CampaignMessage = {
  id: string; org_id: string; campaign_id: string; template_id: string; recipient_user_id: string | null; recipient_email: string
  channel: 'email' | 'in_app'; status: 'queued' | 'sent'; subject: string; body_html: string; body_text: string
  unsubscribe_url: string | null; sent_at: Date | null
}
export type CampaignNotice = { org_id: string; user_id: string; campaign_id: string; kind: 'campaign'; title: string; body: string; link: string }
export type Finish = { recipients: number; excluded: Excluded; channel: 'email' | 'in_app'; status: 'sending' | 'sent'; at: Date }

/** Reads made with the sender's JWT claims and the authenticated role: RLS decides what exists (decision 1). */
export interface SenderReads {
  can(orgId: string, perm: string, workflowId?: string): Promise<boolean>
  savedReport(id: string, orgId: string): Promise<SavedRow | null>
  records(orgId: string, workflowId: string): AsyncIterable<ReportRecord[]>
}
export interface CampaignTx {
  dueCampaigns(now: Date, limit: number): Promise<string[]>
  /** scheduled → sending under the row lock; null when another run has it or it was cancelled. */
  claim(id: string, now: Date): Promise<CampaignRow | null>
  asSender<T>(userId: string, fn: (reads: SenderReads) => Promise<T>): Promise<T>
  template(orgId: string, id: string): Promise<TemplateRow | null>
  orgName(orgId: string): Promise<string>
  roleExists(orgId: string, roleId: string): Promise<boolean>
  roleMembers(orgId: string, roleId: string, limit: number): Promise<Person[]>
  /** Active members only; former members are left out (and counted by the caller). */
  peopleByIds(orgId: string, ids: string[]): Promise<Person[]>
  parent(orgId: string, id: string): Promise<{ status: string; linked_workflow_id: string | null } | null>
  parentRecipients(orgId: string, parentId: string, who: FollowupWho): Promise<{ userId: string | null; email: string }[]>
  /** Lower-cased addresses from `emails` that opted out of this organisation's campaigns. */
  optedOut(orgId: string, emails: string[]): Promise<Set<string>>
  queue(rows: CampaignMessage[]): Promise<void>
  notify(rows: CampaignNotice[]): Promise<void>
  finish(id: string, f: Finish): Promise<void>
  /** scheduled → failed with the reason; false when the campaign is no longer scheduled. */
  fail(id: string, error: string): Promise<boolean>
}
export interface CampaignStore { tx<T>(fn: (tx: CampaignTx) => Promise<T>): Promise<T> }
