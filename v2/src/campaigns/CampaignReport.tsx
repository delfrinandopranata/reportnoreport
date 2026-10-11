import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useMemberEmails } from '../members/useMemberEmails'
import { useTemplates } from '../comms/api'
import { useReports } from '../reports/api'
import { useRoles, useWorkflows } from '../workflows/api'
import { friendlyError } from '../ui/errors'
import { BackIcon } from '../ui/icons'
import { FolderCard } from '../ui/FolderCard'
import { Note } from '../comms/Note'
import { PageHead } from '../comms/PageHead'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { createCampaign, statsOf, useCampaign, useCampaignCompletion, useCampaignDaily, useCampaignStats, type Campaign } from './api'
import { CampaignChart } from './CampaignChart'
import { markFocus } from './focus'
import { audienceText, channelWord } from './labels'
import { campaignTiles, excludedText, pct, pctText, readAudience, type FollowupWho } from './logic'
import { followUpCount } from '../../supabase/functions/_shared/comms/followup.ts'
import { RecipientTable } from './RecipientTable'
import { CampaignStatusMark } from './StatusMark'
import { useSendToOptions } from './sendTo'

export const OPENS_NOTE = 'Opens are approximate: Apple Mail Privacy Protection opens emails automatically.'
const NO_DATA = 'No data yet'

type Props = { campaign: Campaign; notice: string | null; setNotice(m: string): void }

export function CampaignReport({ campaign: c, notice, setNotice }: Props) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const sending = c.status === 'sending'
  const inApp = c.channel === 'in_app'
  const stats = useCampaignStats(orgId, sending)
  const daily = useCampaignDaily(c.id, sending)
  const completion = useCampaignCompletion(userId, c.id, !!c.linked_workflow_id && !!c.audience_snapshot_at)
  const workflows = useWorkflows(orgId)
  const roles = useRoles(orgId)
  const reports = useReports(orgId)
  const templates = useTemplates(orgId)
  const emails = useMemberEmails(orgId)
  const audience = readAudience(c.audience)
  const earlier = useCampaign(audience?.kind === 'followup' ? audience.campaignId : '')
  const sendTo = useSendToOptions(audience?.kind === 'report' ? audience.reportId : '')
  const act = useAction()
  const [error, setError] = useState<string | null>(null)
  const was = useRef(c.status)
  useEffect(() => {
    if (was.current === 'sending' && c.status === 'sent') {
      setNotice(`${c.name} has finished sending.`)
      // the last live poll can predate the final send: read the settled numbers once
      for (const key of [['campaign-stats', orgId], ['campaign-daily', c.id], ['campaign-recipients', c.id], ['campaign-completion', userId, c.id]]) void qc.invalidateQueries({ queryKey: key })
    }
    was.current = c.status
  }, [c.status, c.name, c.id, orgId, userId, qc, setNotice])

  const s = statsOf(stats.data, c.id)
  const tiles = campaignTiles(s, inApp ? 'in_app' : 'email')
  const left = excludedText(c.excluded)
  const workflow = workflows.data?.find((w) => w.id === c.linked_workflow_id)?.name ?? null
  const sentBy = c.sent_by === userId ? 'You' : emails.data?.get(c.sent_by ?? '') ?? 'Former member'
  const names = useMemo(() => ({
    roles: new Map((roles.data ?? []).map((r) => [r.id, r.name])), reports: new Map((reports.data ?? []).map((r) => [r.id, r.name])),
    campaigns: new Map(earlier.data ? [[earlier.data.id, earlier.data.name]] : []), fields: new Map(sendTo.options.map((o) => [o.path, o.label])), workflow,
  }), [roles.data, reports.data, earlier.data, sendTo.options, workflow])
  const template = templates.data?.find((t) => t.id === c.template_id)?.name ?? 'A template that no longer exists'
  const notOpened = followUpCount(s)

  const followUp = (who: FollowupWho) => act.run(async () => {
    setError(null)
    const { data, error: e } = await createCampaign(orgId!, {
      name: `Follow-up: ${c.name}`.slice(0, 120), template_id: c.template_id,
      audience: { kind: 'followup', campaignId: c.id, who }, linked_workflow_id: who === 'not_completed' ? c.linked_workflow_id : null,
    })
    if (e) { setError(friendlyError(e)); return }
    markFocus(data.id)
    await qc.invalidateQueries({ queryKey: ['campaigns', orgId] })
    location.hash = `#/campaigns/${data.id}`
  })
  const busyLabel = act.busy ? 'Creating draft…' : null

  return (
    <section aria-labelledby="campaign-h">
      <a className="rnr-crumb mb-2" href="#/campaigns"><BackIcon />Back to campaigns</a>
      <PageHead id="campaign-h" crumb="Build · Campaigns" title={c.name} accent={false} lede={<CampaignStatusMark status={c.status} />} />
      <div className="flex flex-col gap-6">
        {notice && <p className="rnr-caption" aria-hidden="true">{notice}</p>}
        <div className="flex flex-col gap-1">
          <p className="rnr-muted">
            Sent by {sentBy}.{c.audience_snapshot_at && <> Sending started <When iso={c.audience_snapshot_at} />.</>}{c.finished_at && <> Finished <When iso={c.finished_at} />.</>}
          </p>
          <p className="rnr-caption">{audienceText(audience, names)} · {template} · {channelWord(c.channel)}</p>
        </div>

        {stats.isPending && <Skeleton rows={[{ w: '100%', h: 96 }]} />}
        {stats.isError && (
          <div className="flex flex-col items-start gap-2">
            <Note role="alert">The numbers did not load. Check your connection and try again.</Note>
            <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void stats.refetch()}>Try again</button>
          </div>
        )}
        {stats.isSuccess && (
          <div className="flex flex-col gap-3">
            <h2 className="sr-only">Results</h2>
            <ul className="rnr-campaign-tiles" data-count={tiles.length}>
              {tiles.map((t) => (
                <li key={t.label} className="flex [&>.rnr-folder]:flex [&>.rnr-folder]:w-full [&_.rnr-folder-body]:flex-1" aria-describedby={t.label === 'Opened' ? 'opens-note' : undefined}>
                  <FolderCard tab={t.label} className="rnr-kpi-tile">
                    <p className="rnr-kpi-figure rnr-num" data-empty={t.value === NO_DATA || undefined}>{t.value}</p>
                    <p className="rnr-caption">{t.caption}</p>
                  </FolderCard>
                </li>
              ))}
            </ul>
            {inApp ? <p className="rnr-caption">In-app campaigns report reads only: an in-app notice has no delivery, open or click tracking.</p> : <p className="rnr-caption" id="opens-note">{OPENS_NOTE}</p>}
          </div>
        )}
        {left && <p className="rnr-caption">{left}</p>}

        <FolderCard tab="Activity" headingId="daily-h">
          <div className="flex flex-col gap-3">
            <h2 className="rnr-dialog-title">{inApp ? 'Reads over the first 7 days' : 'Opens and clicks over the first 7 days'}</h2>
            {daily.isPending && <Skeleton rows={[{ w: '100%', h: 200 }]} />}
            {daily.isError && (
              <div className="flex flex-col items-start gap-2">
                <Note role="alert">The chart did not load. Check your connection and try again.</Note>
                <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void daily.refetch()}>Try again</button>
              </div>
            )}
            {daily.data && <CampaignChart days={daily.data} inApp={inApp} startedAt={c.audience_snapshot_at} />}
          </div>
        </FolderCard>

        {c.linked_workflow_id && completion.data === null && (
          <p className="rnr-caption">Completion needs permission to see every record of {workflow ?? 'the linked workflow'}. Ask an admin for access.</p>
        )}
        {completion.isError && (
          <div className="flex flex-col items-start gap-2">
            <Note role="alert">The completion numbers did not load. Check your connection and try again.</Note>
            <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void completion.refetch()}>Try again</button>
          </div>
        )}
        {completion.data && (() => { const cd = completion.data; return (
          <FolderCard tab="Completion" headingId="completion-h">
            <div className="flex flex-col gap-3">
              <h2 className="rnr-dialog-title">{workflow ?? 'The linked workflow'}</h2>
              <div className="flex flex-wrap gap-8">
                {([['Started', cd.started], ['Finished', cd.finished]] as const).map(([label, n]) => {
                  const share = pct(n, cd.people)
                  return (
                    <div key={label}>
                      <p className="rnr-label">{label}</p>
                      <p className="rnr-kpi-figure rnr-num" data-empty={share === null || undefined}>{pctText(share)}</p>
                      <p className="rnr-caption">{n.toLocaleString('en-GB')} of {cd.people.toLocaleString('en-GB')} people</p>
                    </div>
                  )
                })}
              </div>
              {sending ? <p className="rnr-caption">Reminders become available once every email has left the queue.</p>
                : cd.people > cd.finished
                  ? <div><button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={act.busy} onClick={() => void followUp('not_completed')}>{busyLabel ?? 'Remind non-completers'}</button></div>
                  : <p className="rnr-muted">Everyone has finished.</p>}
            </div>
          </FolderCard>
        ) })()}

        {sending && <p className="rnr-caption">Follow-ups become available once every email has left the queue.</p>}
        {c.status === 'sent' && stats.isSuccess && (notOpened > 0
          ? <div><button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={act.busy} onClick={() => void followUp('not_opened')}>{busyLabel ?? (inApp ? 'Send follow-up to not read' : 'Send follow-up to not opened')}</button></div>
          : <p className="rnr-muted">{inApp ? 'Everyone read it.' : 'Everyone opened it.'}</p>)}
        {error && <Note role="alert">{error}</Note>}

        <RecipientTable campaign={c} />
      </div>
    </section>
  )
}
