import { useEffect, useId, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { useTemplates } from '../comms/api'
import { useMemberEmails } from '../members/useMemberEmails'
import { ReportError, useReports } from '../reports/api'
import { useRoles, useWorkflows } from '../workflows/api'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { whenText } from '../ui/dates'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon, PencilIcon, XIcon } from '../ui/icons'
import { FolderCard } from '../ui/FolderCard'
import { When } from '../ui/Time'
import { FieldError, Note } from '../comms/Note'
import { PageHead } from '../comms/PageHead'
import { useAction } from '../ui/useAction'
import { useLeaveGuard } from '../ui/useLeaveGuard'
import { cancelCampaign, deleteCampaign, scheduleCampaign, updateCampaign, useAudienceSize, useCampaign, type Campaign, type CampaignFields } from './api'
import { markFocus, takeFocus } from './focus'
import { audienceText, channelWord, type AudienceNames } from './labels'
import { campaignTemplateIssue, MAX_AUDIENCE, readAudience, TOO_BIG, type Audience } from './logic'
import { sendProblem, zoneHint, type SendField } from './send'
import { SendDialog } from './SendDialog'
import { useSendToOptions } from './sendTo'
import { CampaignStatusMark } from './StatusMark'

type Draft = { name: string; templateId: string; kind: 'role' | 'report' | 'followup' | ''; roleId: string; reportId: string; to: string; linked: string }
function draftOf(c: Campaign, mayReport: boolean): Draft {
  const a = readAudience(c.audience)
  return {
    name: c.name, templateId: c.template_id ?? '', kind: a?.kind ?? (mayReport ? '' : 'role'), linked: c.linked_workflow_id ?? '',
    roleId: a?.kind === 'role' ? a.roleId : '', reportId: a?.kind === 'report' ? a.reportId : '',
    to: a?.kind === 'report' ? (a.to === 'starter' ? 'starter' : a.to.field) : 'starter',
  }
}
function audienceOf(d: Draft, saved: Audience | null): Audience | null {
  if (d.kind === 'role') return d.roleId ? { kind: 'role', roleId: d.roleId } : null
  if (d.kind === 'report') return d.reportId ? { kind: 'report', reportId: d.reportId, to: d.to === 'starter' ? 'starter' : { field: d.to } } : null
  return d.kind === 'followup' ? saved : null // follow-up audiences are made by the report page and are not edited here
}
const SAVE_CONFLICT = 'This campaign was changed by someone else. Reload to see the latest version, then make your change again.'
const LINK_REFUSED = /link a workflow whose records you can all see/
const pad = (n: number) => String(n).padStart(2, '0')
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const inAnHour = () => { const d = new Date(Date.now() + 60 * 60_000); d.setSeconds(0, 0); return localInput(d) }
const zoneOffset = () => new Intl.DateTimeFormat('en-GB', { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? ''

type Props = { campaign: Campaign; notice: string | null; setNotice(m: string): void; onMoved(): void }

export function CampaignEditor({ campaign: c, notice, setNotice, onMoved }: Props) {
  const { orgId, userId, can } = useOrg()
  const qc = useQueryClient()
  const uid = useId()
  const mayReport = can('reports.view') || can('reports.manage')
  const templates = useTemplates(orgId)
  const roles = useRoles(orgId)
  const reports = useReports(orgId)
  const workflows = useWorkflows(orgId)
  const emails = useMemberEmails(orgId)
  const savedAudience = readAudience(c.audience)
  const earlier = useCampaign(savedAudience?.kind === 'followup' ? savedAudience.campaignId : '')
  const [base, setBase] = useState(() => draftOf(c, mayReport))
  const [d, setD] = useState(base)
  const [updatedAt, setUpdatedAt] = useState(c.updated_at)
  const [problem, setProblem] = useState<{ field: SendField | 'link'; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [later, setLater] = useState(false)
  const [at, setAt] = useState(inAnHour)
  const [bounds] = useState(() => ({ min: localInput(new Date(Date.now() + 60_000)), max: localInput(new Date(Date.now() + 365 * 86_400_000)) }))
  const [confirm, setConfirm] = useState<'send' | 'cancel' | 'delete' | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const save = useAction()
  const send = useAction()
  const draft = c.status === 'draft'
  const dirty = draft && JSON.stringify(d) !== JSON.stringify(base)
  const guard = useLeaveGuard(dirty, `#/campaigns/${c.id}`)
  useEffect(() => { if (takeFocus(c.id)) document.getElementById('campaign-h')?.focus() }, [c.id]) // a follow-up draft just opened from the report

  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setProblem(null); setError(null) }
  const audience = audienceOf(d, savedAudience)
  const size = useAudienceSize(userId, orgId, draft ? audience : null)
  const sendTo = useSendToOptions(d.kind === 'report' ? d.reportId : '')
  const template = templates.data?.find((t) => t.id === d.templateId) ?? null
  const issue = template ? campaignTemplateIssue(template) : null
  const channel = template?.channel ?? c.channel
  const inApp = channel === 'in_app'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const count = size.data ? ('people' in size.data ? size.data.people : size.data.records) : 0
  const tooBig = count > MAX_AUDIENCE
  const refreshAll = () => Promise.all([qc.invalidateQueries({ queryKey: ['campaign', c.id] }), qc.invalidateQueries({ queryKey: ['campaigns', orgId] })])

  const names: AudienceNames = useMemo(() => ({
    roles: new Map((roles.data ?? []).map((r) => [r.id, r.name])), reports: new Map((reports.data ?? []).map((r) => [r.id, r.name])),
    campaigns: new Map(earlier.data ? [[earlier.data.id, earlier.data.name]] : []), fields: new Map(sendTo.options.map((o) => [o.path, o.label])),
    workflow: workflows.data?.find((w) => w.id === (d.linked || c.linked_workflow_id))?.name ?? null,
  }), [roles.data, reports.data, earlier.data, sendTo.options, workflows.data, d.linked, c.linked_workflow_id])
  const linkedName = workflows.data?.find((w) => w.id === d.linked)?.name ?? null

  const focusField = (f: SendField | 'link') => {
    const ids = { name: 'n', template: 't', audience: d.kind === 'role' ? 'r' : d.kind === 'report' ? 'p' : 'a', at: 'at', link: 'w' } as const
    document.getElementById(`${uid}-${ids[f]}`)?.focus()
  }
  const fail = (p: { field: SendField | 'link'; message: string }) => { setProblem(p); setTimeout(() => focusField(p.field), 0) }

  const fields = (): CampaignFields => ({ name: d.name.trim(), template_id: d.templateId || null, audience: audience ?? {}, linked_workflow_id: d.linked || null })
  /** Saves when dirty. false: nothing was saved (a sentence or the conflict block says why). */
  async function persist(): Promise<boolean> {
    if (!d.name.trim()) { fail({ field: 'name', message: 'Enter a name for the campaign.' }); return false }
    if (!dirty) return true
    const { data, error: e } = await updateCampaign(c.id, fields(), updatedAt)
    if (e) {
      if (LINK_REFUSED.test(e.message)) fail({ field: 'link', message: friendlyError(e) })
      else setError(friendlyError(e))
      return false
    }
    if (!data.length) { setConflict(true); return false }
    setUpdatedAt(data[0].updated_at)
    setBase(d)
    return true
  }
  const onSave = () => save.run(async () => {
    const ok = await persist()
    if (ok) setNotice('Draft saved.')
    return ok
  }, true)
  const review = () => {
    setError(null)
    const p = sendProblem({ name: d.name, templateId: d.templateId, audienceReady: !!audience, tooBig, later, at, now: new Date() })
    if (p) { fail(p); return }
    setDialogError(null)
    setConfirm('send')
  }
  const confirmSend = () => send.run(async () => {
    if (!(await persist())) { setConfirm(null); return }
    const { error: e } = await scheduleCampaign(c.id, later ? new Date(at).toISOString() : null)
    if (e) { setDialogError(friendlyError(e)); await refreshAll(); return }
    setNotice(later ? 'Campaign scheduled.' : 'Sending started.')
    setConfirm(null)
    await refreshAll()
    onMoved()
  })
  const reopen = () => send.run(async () => {
    const { error: e } = await cancelCampaign(c.id)
    if (e) { setDialogError(friendlyError(e)); await refreshAll(); return }
    setNotice(c.status === 'scheduled' ? 'Schedule cancelled.' : 'Back to a draft.')
    setConfirm(null)
    await refreshAll()
    onMoved()
  })
  const remove = () => send.run(async () => {
    const { data, error: e } = await deleteCampaign(c.id)
    if (e || !data.length) { setDialogError(e ? friendlyError(e) : 'This campaign is no longer a draft. The page now shows its latest state.'); await refreshAll(); return }
    guard.stay()
    markFocus('campaigns-h')
    await qc.invalidateQueries({ queryKey: ['campaigns', orgId] })
    location.hash = '#/campaigns'
  })

  const sizeLine = (() => {
    if (!audience) return { text: 'Choose who receives this campaign.' }
    if (audience.kind === 'followup') return { text: 'Counted when sending starts.' }
    if (size.isPending) return { text: 'Counting…' }
    if (size.isError) {
      if (size.error instanceof ReportError && size.error.status !== null) return { text: size.error.message, refused: true }
      return { text: 'The audience size did not load. It is counted again when sending starts.', retry: true }
    }
    if ('people' in size.data) return { text: `About ${size.data.people.toLocaleString('en-GB')} ${size.data.people === 1 ? 'person' : 'people'}.` }
    return { text: `About ${size.data.records.toLocaleString('en-GB')} ${size.data.records === 1 ? 'record matches' : 'records match'}.` }
  })()
  const counted = !audience || audience.kind === 'followup' || 'refused' in sizeLine || 'retry' in sizeLine || size.isPending
  const people = counted ? 'Counted when sending starts' : sizeLine.text.replace(/\.$/, '')
  const whenSummary = later ? `${whenText(new Date(at).toISOString())} (${zone.replaceAll('_', ' ')})` : 'Now'
  const field = (key: SendField | 'link') => problem?.field === key
  const err = (key: SendField | 'link') => (field(key) ? { 'aria-invalid': true as const, 'aria-describedby': `${uid}-${key}-e` } : {})
  const errMsg = (key: SendField | 'link') => field(key) && !(key === 'audience' && tooBig) && <FieldError id={`${uid}-${key}-e`} role="alert">{problem!.message}</FieldError>
  const sendLabel = later ? 'Schedule' : 'Send now'

  return (
    <section aria-labelledby="campaign-h">
      <a className="rnr-crumb mb-2" href="#/campaigns"><BackIcon />Back to campaigns</a>
      <PageHead id="campaign-h" crumb="Build · Campaigns" title={c.name} accent={false}
        lede={dirty ? <span className="rnr-status"><PencilIcon size={14} />Unsaved changes</span> : <CampaignStatusMark status={c.status} />} />
      {notice && <p className="rnr-caption mb-4" aria-hidden="true">{notice}</p>}
      <div className="flex max-w-160 flex-col gap-6">

      {c.status === 'scheduled' && (
        <FolderCard tab="Scheduled" headingId="sch-h">
          <div className="flex flex-col gap-3">
            <h2 className="rnr-dialog-title">Scheduled for <When iso={c.scheduled_at!} /></h2>
            <dl className="rnr-review">
              <dt>Template</dt><dd>{templates.data?.find((t) => t.id === c.template_id)?.name ?? 'A template that no longer exists'}</dd>
              <dt>Audience</dt><dd>{audienceText(savedAudience, names)}</dd>
              <dt>People</dt><dd>Counted when sending starts</dd>
              {c.linked_workflow_id && <><dt>Workflow</dt><dd>{names.workflow ?? 'The linked workflow'}</dd></>}
              <dt>Scheduled by</dt><dd>{c.sent_by === userId ? 'You' : emails.data?.get(c.sent_by ?? '') ?? 'Former member'}</dd>
            </dl>
            <p className="rnr-muted">It cannot be edited until the schedule is cancelled. You can cancel until sending starts.</p>
            <div><button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { setDialogError(null); setConfirm('cancel') }}>Cancel schedule</button></div>
          </div>
        </FolderCard>
      )}
      {c.status === 'failed' && (
        <FolderCard tab="Not sent" headingId="fail-h">
          <div className="flex flex-col gap-3">
            <h2 className="rnr-dialog-title">This campaign was not sent</h2>
            <Note role="alert">{c.error ?? 'This campaign could not be prepared. Edit it and schedule it again.'}</Note>
            <p className="rnr-muted">Nothing was sent. Edit the campaign, then schedule it again.</p>
            <div><button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={send.busy} onClick={() => void reopen()}>{send.busy ? 'Opening…' : 'Edit and schedule again'}</button></div>
            {dialogError && <FieldError role="alert">{dialogError}</FieldError>}
          </div>
        </FolderCard>
      )}

      {draft && (
        <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void onSave() }} noValidate>
          <FolderCard tab="Message" headingId={`${uid}-m`}>
            <div className="flex flex-col gap-4">
            <div className="rnr-field" data-invalid={field('name') || undefined}>
              <label className="rnr-label" htmlFor={`${uid}-n`}>Name</label>
              <input id={`${uid}-n`} className="rnr-input" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} {...err('name')} />
              {errMsg('name')}
            </div>
            {templates.data && !templates.data.some((t) => t.kind !== 'invite') ? (
              <div className="flex flex-col items-start gap-2">
                <p className="rnr-muted">There are no message templates yet.</p>
                {can('comms.manage')
                  ? <a className="rnr-btn rnr-btn-secondary" href="#/templates">Go to templates</a>
                  : <p className="rnr-muted">Ask someone who manages templates to create one.</p>}
              </div>
            ) : (
              <div className="rnr-field" data-invalid={field('template') || undefined}>
                <label className="rnr-label" htmlFor={`${uid}-t`}>Message template</label>
                <div className="rnr-select"><select id={`${uid}-t`} className="rnr-input" value={d.templateId} onChange={(e) => set({ templateId: e.target.value })}
                  {...(field('template') ? err('template') : issue ? { 'aria-describedby': `${uid}-ti` } : {})}>
                  <option value="">Choose a template</option>
                  {(['email', 'in_app'] as const).map((ch) => (
                    <optgroup key={ch} label={ch === 'email' ? 'Email' : 'In-app'}>
                      {templates.data?.filter((t) => t.channel === ch && t.kind !== 'invite').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </select></div>
                {errMsg('template')}
                <p id={`${uid}-ti`} className="rnr-hint rnr-hint-warn" aria-live="polite">{issue}</p>
              </div>
            )}
            {template && (
              <p className="rnr-caption">{inApp
                ? 'Sent as an in-app notice. It shows in the bell and cannot be muted. People without an account are left out.'
                : 'Sent as an email. Each person also gets the unsubscribe link in the footer.'}</p>
            )}
            </div>
          </FolderCard>

          <FolderCard tab="Audience" headingId={`${uid}-au`}>
            <div className="flex flex-col gap-4">
            {d.kind === 'followup' ? (
              <p className="rnr-muted">{savedAudience?.kind === 'followup' && savedAudience.who === 'not_completed'
                ? <>People from <a href={`#/campaigns/${savedAudience.campaignId}`}>{earlier.data?.name ?? 'the earlier campaign'}</a> who have not finished {names.workflow ?? 'the linked workflow'}.</>
                : <>People from {savedAudience?.kind === 'followup' ? <a href={`#/campaigns/${savedAudience.campaignId}`}>{earlier.data?.name ?? 'the earlier campaign'}</a> : 'the earlier campaign'} who did not open it.</>}</p>
            ) : (
              <>
                {mayReport && (
                  <div className="rnr-seg self-start" role="group" aria-label="Who receives it">
                    {(['role', 'report'] as const).map((k, i) => (
                      <button key={k} id={i === 0 ? `${uid}-a` : undefined} type="button" aria-pressed={d.kind === k} onClick={() => set({ kind: k })}>{k === 'role' ? 'A role' : 'A report'}</button>
                    ))}
                  </div>
                )}
                {d.kind === 'role' && (roles.data && !roles.data.length ? <p className="rnr-muted">There are no roles yet.</p> : (
                  <div className="rnr-field">
                    <label className="rnr-label" htmlFor={`${uid}-r`}>Role</label>
                    <div className="rnr-select"><select id={`${uid}-r`} className="rnr-input" value={d.roleId} onChange={(e) => set({ roleId: e.target.value })} {...err('audience')}>
                      <option value="">Choose a role</option>
                      {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select></div>
                  </div>
                ))}
                {d.kind === 'report' && (reports.data && !reports.data.length ? <p className="rnr-muted">There are no saved reports yet.</p> : (
                  <>
                    <div className="rnr-field">
                      <label className="rnr-label" htmlFor={`${uid}-p`}>Report</label>
                      <div className="rnr-select"><select id={`${uid}-p`} className="rnr-input" value={d.reportId} onChange={(e) => set({ reportId: e.target.value, to: 'starter' })} {...err('audience')}>
                        <option value="">Choose a report</option>
                        {reports.data?.map((r) => <option key={r.id} value={r.id} disabled={!!r.group_by}>{r.group_by ? `${r.name} (grouped, lists groups not people)` : r.name}</option>)}
                      </select></div>
                      <p className="rnr-caption">Grouped reports list groups, not people, so they cannot be used.</p>
                    </div>
                    {d.reportId && (
                      <div className="rnr-field">
                        <label className="rnr-label" htmlFor={`${uid}-s`}>Send to</label>
                        <div className="rnr-select"><select id={`${uid}-s`} className="rnr-input" value={d.to} onChange={(e) => set({ to: e.target.value })} aria-describedby={`${uid}-sh`}>
                          <option value="starter">The person who started each record</option>
                          {sendTo.options.map((o) => <option key={o.path} value={o.path}>The address in {o.label}</option>)}
                        </select></div>
                        <p id={`${uid}-sh`} className="rnr-hint">A started-by recipient must be an active member. An address in an answer can belong to someone without an account.</p>
                        {sendTo.ready && !sendTo.options.length && <p className="rnr-caption">This workflow has no short-text answer that could hold an address.</p>}
                      </div>
                    )}
                  </>
                ))}
                {errMsg('audience')}
              </>
            )}
            <p className={`rnr-num ${'refused' in sizeLine ? 'rnr-error' : 'rnr-muted'}`} aria-live="polite" aria-atomic="true">{'refused' in sizeLine && <XIcon />}{sizeLine.text}</p>
            {'retry' in sizeLine && <div><button type="button" className="rnr-btn rnr-btn-ghost" onClick={() => void size.refetch()}>Try again</button></div>}
            {tooBig && <FieldError id={`${uid}-audience-e`} role="alert">{TOO_BIG}</FieldError>}
            <p className="rnr-caption">
              {audience?.kind === 'report' && 'Each record gives one recipient. Records without a usable address are left out. '}
              The list is taken when sending starts. {inApp
                ? 'People without an account cannot get an in-app notice and are left out, and the report counts them.'
                : 'People who unsubscribed, have no email address or are listed twice are left out, and the report counts them.'}
            </p>
            </div>
          </FolderCard>

          <FolderCard tab="Completion tracking" headingId={`${uid}-ct`}>
            <div className="flex flex-col gap-4">
            <div className="rnr-field" data-invalid={field('link') || undefined}>
              <label className="rnr-label" htmlFor={`${uid}-w`}>Linked workflow (optional)</label>
              <div className="rnr-select"><select id={`${uid}-w`} className="rnr-input" value={d.linked} onChange={(e) => set({ linked: e.target.value })}
                aria-describedby={field('link') ? `${uid}-link-e` : `${uid}-wh`} aria-invalid={field('link') || undefined}>
                <option value="">None</option>
                {workflows.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
              <p id={`${uid}-wh`} className="rnr-hint">The report then shows how many recipients started and finished it, and can remind the ones who have not.</p>
              {errMsg('link')}
            </div>
            </div>
          </FolderCard>

          <FolderCard tab="When to send" headingId={`${uid}-wt`}>
            <div className="flex flex-col gap-4">
            <div className="rnr-seg self-start" role="group" aria-label="When to send">
              <button type="button" aria-pressed={!later} onClick={() => { setLater(false); setProblem(null) }}>Send now</button>
              <button type="button" aria-pressed={later} onClick={() => { setLater(true); setProblem(null) }}>Send later</button>
            </div>
            {later && (
              <div className="rnr-field" data-invalid={field('at') || undefined}>
                <label className="rnr-label" htmlFor={`${uid}-at`}>Send at</label>
                <input id={`${uid}-at`} type="datetime-local" className="rnr-input rnr-num" value={at} min={bounds.min}
                  max={bounds.max} onChange={(e) => { setAt(e.target.value); setProblem(null) }}
                  aria-describedby={field('at') ? `${uid}-at-e` : `${uid}-at-h`} aria-invalid={field('at') || undefined} />
                <p id={`${uid}-at-h`} className="rnr-hint">{zoneHint(zone, zoneOffset())}</p>
                {errMsg('at')}
              </div>
            )}
            </div>
          </FolderCard>

          {conflict && (
            <Note role="alert">
              <p>{SAVE_CONFLICT}</p>
              <button type="button" className="rnr-btn rnr-btn-secondary mt-2" onClick={() => { guard.stay(); void refreshAll() }}>Reload campaign</button>
            </Note>
          )}
          {error && <Note role="alert">{error}</Note>}
          <div className="rnr-actions mt-0!">
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="rnr-btn rnr-btn-secondary" aria-busy={save.busy}>
                {save.busy && <span className="rnr-spin" aria-hidden="true" />}{save.saved ? <><CheckIcon /><span className="rnr-pop">Saved</span></> : save.busy ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" className="rnr-btn rnr-btn-primary" onClick={review}>{sendLabel}</button>
            </div>
            <button type="button" className="rnr-btn rnr-btn-danger" onClick={() => { setDialogError(null); setConfirm('delete') }}>Delete draft</button>
          </div>
        </form>
      )}
      </div>

      <SendDialog open={confirm === 'send'} busy={send.busy} error={dialogError} onClose={() => setConfirm(null)} onConfirm={() => void confirmSend()}
        review={{ name: d.name.trim() || c.name, template: template ? `${template.name} · ${channelWord(template.channel)}` : 'No template', audience: audienceText(audience, names), people, workflow: linkedName, when: whenSummary, later, inApp }} />
      <ConfirmDialog open={confirm === 'cancel'} title={`Cancel the schedule for ${c.name}?`} body={`${c.name} goes back to a draft and nothing is sent. You can schedule it again.`}
        confirmLabel="Cancel schedule" dismissLabel="Keep schedule" busyLabel="Cancelling…" busy={send.busy} error={dialogError} onClose={() => setConfirm(null)} onConfirm={() => void reopen()} />
      <ConfirmDialog open={confirm === 'delete'} title={`Delete ${c.name}?`} body={`${c.name} is a draft and will be deleted for everyone. It cannot be recovered.`}
        confirmLabel="Delete draft" busyLabel="Deleting…" busy={send.busy} error={dialogError} onClose={() => setConfirm(null)} onConfirm={() => void remove()} />
      <ConfirmDialog open={!!guard.leaveTo} title="Leave without saving?" body={`Your changes to ${d.name.trim() || c.name} will be lost.`}
        confirmLabel="Leave" busyLabel="Leaving…" busy={false} error={null} onClose={guard.stay} onConfirm={guard.leave} />
    </section>
  )
}
