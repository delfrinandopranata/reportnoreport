import type { Excluded, FollowupWho, Person, Recipient } from '../_shared/comms/campaign.ts'
import type { ReportRecord } from '../_shared/reports/index.ts'
import type { TemplateRow } from '../advance/notify.ts'
import type { SavedRow } from '../run-report/handler.ts'

export type CampaignRow = { id: string; org_id: string; name: string; template_id: string | null; audience: unknown; sent_by: string | null }
/**
 * One set-based insert for the whole audience (QA-P6-3). `subject`, `html` and `text` are rendered once; `nameToken` and
 * `linkToken` stand for the per-person name and unsubscribe page link, which the database fills in for every row.
 */
export type QueueInput = {
  campaignId: string; orgId: string; templateId: string; channel: 'email' | 'in_app'
  subject: string; html: string; text: string; nameToken: string; linkToken: string
  list: Recipient[]; now: Date
  unsubscribe: { url: string; page: string; secret: string }
}
export type Finish = { recipients: number; excluded: Excluded; channel: 'email' | 'in_app'; status: 'sending' | 'sent'; at: Date }

/** Reads made with the sender's JWT claims and the authenticated role: RLS decides what exists (decision 1). */
export interface SenderReads {
  can(orgId: string, perm: string, workflowId?: string): Promise<boolean>
  savedReport(id: string, orgId: string): Promise<SavedRow | null>
  records(orgId: string, workflowId: string): AsyncIterable<ReportRecord[]>
}
export interface CampaignTx {
  /** Scheduled, due and not leased by a running attempt. */
  dueCampaigns(now: Date, limit: number): Promise<string[]>
  /**
   * Spends an attempt and takes a lease, in a transaction of its own that commits before the work starts, so a run the
   * runtime kills (which rolls the work back) still counts. Null when the campaign is not due, or another run holds the lease.
   */
  startAttempt(id: string, now: Date, leaseUntil: Date): Promise<number | null>
  /** scheduled → sending under the row lock; null when another run has it or it was cancelled. */
  claim(id: string, now: Date): Promise<CampaignRow | null>
  asSender<T>(userId: string, fn: (reads: SenderReads) => Promise<T>): Promise<T>
  template(orgId: string, id: string): Promise<TemplateRow | null>
  orgName(orgId: string): Promise<string>
  roleExists(orgId: string, roleId: string): Promise<boolean>
  /** Distinct addresses of active role members who have not opted out: the number the limit applies to. */
  roleEligible(orgId: string, roleId: string): Promise<number>
  /** Every active member of the role, opted out or not (opt-outs are counted by planRecipients); call roleEligible first. */
  roleMembers(orgId: string, roleId: string): Promise<Person[]>
  /** Active members only; former members are left out (and counted by the caller). */
  peopleByIds(orgId: string, ids: string[]): Promise<Person[]>
  parent(orgId: string, id: string): Promise<{ status: string; linked_workflow_id: string | null } | null>
  parentRecipients(orgId: string, parentId: string, who: FollowupWho): Promise<{ userId: string | null; email: string }[]>
  /** Lower-cased addresses from `emails` that opted out of this organisation's campaigns. */
  optedOut(orgId: string, emails: string[]): Promise<Set<string>>
  /** Inserts every message (and, for in-app, every notice) with one INSERT … SELECT. */
  queueAudience(q: QueueInput): Promise<void>
  finish(id: string, f: Finish): Promise<void>
  /** scheduled → failed with the reason; false when the campaign is no longer scheduled. */
  fail(id: string, error: string): Promise<boolean>
}
export interface CampaignStore { tx<T>(fn: (tx: CampaignTx) => Promise<T>): Promise<T> }
