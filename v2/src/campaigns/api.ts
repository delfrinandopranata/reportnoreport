import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { ReportError, reportError } from '../reports/api'
import { csvFilename } from '../reports/logic'
import { NO_STATS, recipientCsv, type Audience, type Excluded, type RecipientRow, type Stats } from './logic'
import { readAllPages } from './pages'

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
export const CAMPAIGN_STATUS: Record<CampaignStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', failed: 'Not sent' }
export type Campaign = {
  id: string; org_id: string; name: string; template_id: string | null; audience: unknown; linked_workflow_id: string | null
  status: CampaignStatus; scheduled_at: string | null; sent_by: string | null; audience_snapshot_at: string | null
  channel: 'email' | 'in_app' | null; recipients: number | null; excluded: Partial<Excluded>; error: string | null
  finished_at: string | null; created_at: string; updated_at: string
}
const COLS = 'id, org_id, name, template_id, audience, linked_workflow_id, status, scheduled_at, sent_by, audience_snapshot_at, channel, recipients, excluded, error, finished_at, created_at, updated_at'

export const CAMPAIGN_LIST_LIMIT = 200 // shortcut: the newest 200, with the full count on screen; add paging when an organisation has more
const moving = (c: Pick<Campaign, 'status'> | null | undefined) => !!c && (c.status === 'scheduled' || c.status === 'sending')
export const useCampaigns = (orgId: string | null) => useQuery({
  queryKey: ['campaigns', orgId],
  enabled: !!orgId,
  refetchInterval: (q) => (q.state.data?.rows.some(moving) ? 10_000 : false), // scheduled → sending → sent happens on the server
  queryFn: async () => {
    const { data, error, count } = await supabase.from('campaigns').select(COLS, { count: 'exact' }).eq('org_id', orgId!)
      .order('created_at', { ascending: false }).range(0, CAMPAIGN_LIST_LIMIT - 1)
    if (error) throw error
    return { rows: data as unknown as Campaign[], total: count ?? data.length }
  },
})
export const useCampaign = (id: string) => useQuery({
  queryKey: ['campaign', id],
  enabled: !!id,
  refetchInterval: (q) => (moving(q.state.data) ? 10_000 : false),
  refetchOnWindowFocus: false, // a draft being edited is never swapped under the editor; saves, schedules and Reload refetch explicitly
  queryFn: async () => {
    const { data, error } = await supabase.from('campaigns').select(COLS).eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as Campaign | null
  },
})
export type CampaignFields = { name: string; template_id: string | null; audience: Audience | Record<string, never>; linked_workflow_id: string | null }
export const createCampaign = (orgId: string, f: Partial<CampaignFields> & { name: string }) =>
  supabase.from('campaigns').insert({ org_id: orgId, ...f }).select('id').single()
export const updateCampaign = (id: string, f: CampaignFields, updatedAt: string) =>
  supabase.from('campaigns').update(f).eq('id', id).eq('updated_at', updatedAt).select('updated_at')
export const deleteCampaign = (id: string) => supabase.from('campaigns').delete().eq('id', id).select('id')
export const scheduleCampaign = (id: string, at: string | null) =>
  supabase.rpc('schedule_campaign', at ? { p_campaign: id, p_at: at } : { p_campaign: id })
export const cancelCampaign = (id: string) => supabase.rpc('cancel_campaign', { p_campaign: id })

export const useCampaignStats = (orgId: string | null, live = false) => useQuery({
  queryKey: ['campaign-stats', orgId],
  enabled: !!orgId,
  refetchInterval: live ? 10_000 : false,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('campaign_stats', { p_org: orgId! })
    if (error) throw error
    return new Map((data ?? []).map(({ campaign_id, ...s }) => [campaign_id, s as Stats]))
  },
})
export const statsOf = (m: Map<string, Stats> | undefined, id: string): Stats => m?.get(id) ?? NO_STATS

export type DayRow = { day: number; opens: number; clicks: number }
export const useCampaignDaily = (id: string, live: boolean) => useQuery({
  queryKey: ['campaign-daily', id],
  refetchInterval: live ? 30_000 : false,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('campaign_daily', { p_campaign: id })
    if (error) throw error
    return (data ?? []) as DayRow[]
  },
})

export type Completion = { people: number; started: number; finished: number }
/** null: the viewer may not see every record of the linked workflow (42501); the page hides the block and says why. */
export const useCampaignCompletion = (userId: string, id: string, enabled: boolean) => useQuery({
  queryKey: ['campaign-completion', userId, id],
  enabled,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('campaign_completion', { p_campaign: id })
    if (error?.code === '42501') return null
    if (error) throw error
    return ((data ?? [])[0] ?? { people: 0, started: 0, finished: 0 }) as Completion
  },
})

export type RecipientFilter = 'all' | 'not_opened' | 'bounced' | 'failed'
export const RECIPIENT_PAGE = 50
const RCOLS = 'id, recipient_email, status, error, delivered_at, opened_at, clicked_at, bounced_at'
export const useRecipients = (id: string, filter: RecipientFilter, page: number, live = false) => useQuery({
  queryKey: ['campaign-recipients', id, filter, page],
  refetchInterval: live ? 10_000 : false,
  placeholderData: keepPreviousData,
  queryFn: async () => {
    let q = supabase.from('messages').select(RCOLS, { count: 'exact' }).eq('campaign_id', id)
    if (filter === 'not_opened') q = q.eq('status', 'sent').is('opened_at', null).is('bounced_at', null)
    if (filter === 'bounced') q = q.not('bounced_at', 'is', null)
    if (filter === 'failed') q = q.eq('status', 'failed')
    const from = (page - 1) * RECIPIENT_PAGE
    const { data, error, count } = await q.order('recipient_email').order('id').range(from, from + RECIPIENT_PAGE - 1)
    if (error) throw error
    return { rows: data as RecipientRow[], total: count ?? 0 }
  },
})

const DOWNLOAD_FAILED = 'The recipient list did not download. Try again.'
/** Every recipient, never a page (decision 9); refuses rather than saves a short file. */
export async function downloadRecipients(c: Campaign): Promise<{ filename: string } | { error: string }> {
  const { count, error } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id)
  if (error || count === null) return { error: DOWNLOAD_FAILED }
  let rows: RecipientRow[] | 'changed'
  try {
    rows = await readAllPages(async (after) => {
      const { data, error: e } = await supabase.from('messages').select(RCOLS).eq('campaign_id', c.id).gt('id', after).order('id').limit(1000)
      if (e) throw e
      return data as RecipientRow[]
    }, count)
  } catch {
    return { error: DOWNLOAD_FAILED } // nothing partial is saved
  }
  if (rows === 'changed') return { error: 'The list changed while it downloaded. Try again.' }
  const filename = csvFilename(c.name, new Date().toISOString().slice(0, 10))
  const href = URL.createObjectURL(new Blob([recipientCsv(rows, c.channel ?? 'email')], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href, download: filename }).click()
  setTimeout(() => URL.revokeObjectURL(href), 0)
  return { filename }
}

export type AudienceSize = { people: number } | { records: number }
/** An estimate for the editor; the real list is taken when sending starts (decision 1). Follow-ups are counted then. A refusal by run-report is a ReportError with its sentence. */
export const useAudienceSize = (userId: string, orgId: string | null, audience: Audience | null) => useQuery({
  queryKey: ['audience-size', userId, orgId, audience],
  enabled: !!orgId && !!audience && audience.kind !== 'followup',
  retry: (n, e) => !(e instanceof ReportError && e.status !== null) && n < 2,
  queryFn: async (): Promise<AudienceSize> => {
    const a = audience as Audience
    if (a.kind === 'role') {
      const { count, error } = await supabase.from('member_roles').select('member_id, members!inner(status)', { count: 'exact', head: true })
        .eq('role_id', a.roleId).eq('members.status', 'active')
      if (error) throw error
      return { people: count ?? 0 }
    }
    const reportId = a.kind === 'report' ? a.reportId : ''
    const { data, error } = await supabase.functions.invoke<{ result: { total: number } }>('run-report', { body: { orgId, reportId, page: 1, pageSize: 1 } })
    if (error) throw await reportError(error, true)
    return { records: data?.result.total ?? 0 }
  },
})

export const useOptOut = (userId: string, orgId: string | null) => useQuery({
  queryKey: ['optout', userId, orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data: email, error } = await supabase.rpc('my_member_email', { p_org: orgId! })
    if (error) throw error
    if (!email) return null
    const { data, error: e } = await supabase.from('email_optouts').select('email').eq('org_id', orgId!).eq('email', email)
    if (e) throw e
    return { email: email as string, optedOut: data.length > 0 }
  },
})
export const setOptOut = (orgId: string, email: string, optedOut: boolean) => (optedOut
  ? supabase.from('email_optouts').insert({ org_id: orgId, email, reason: 'settings' }).select('email')
  : supabase.from('email_optouts').delete().eq('org_id', orgId).eq('email', email).select('email'))
