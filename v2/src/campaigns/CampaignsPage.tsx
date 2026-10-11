import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { NAV_ICONS, PlusIcon, XIcon } from '../ui/icons'
import { LoadError, Note, FieldError } from '../comms/Note'
import { PageHead } from '../comms/PageHead'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { CAMPAIGN_LIST_LIMIT, createCampaign, deleteCampaign, statsOf, useCampaignStats, useCampaigns, type Campaign } from './api'
import { markFocus, takeFocus } from './focus'
import { pct, pctText } from './logic'
import { CampaignStatusMark } from './StatusMark'

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
const sendDate = (c: Campaign) => (c.status === 'draft' ? null : c.finished_at ?? c.audience_snapshot_at ?? c.scheduled_at)
const NOT_A_DRAFT = 'This campaign is no longer a draft, or it was already deleted. The list now shows the latest.'

export function CampaignsPage() {
  const { orgId, orgs } = useOrg()
  const list = useCampaigns(orgId)
  const sending = !!list.data?.rows.some((c) => c.status === 'sending')
  const stats = useCampaignStats(orgId, sending)
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [doomed, setDoomed] = useState<Campaign | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const removal = useAction()
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  useEffect(() => { if (takeFocus('campaigns-h')) document.getElementById('campaigns-h')?.focus() }, []) // arrived from a deleted draft

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      setCreating(true)
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [])

  const confirmDelete = () => removal.run(async () => {
    if (!doomed) return
    const { data, error } = await deleteCampaign(doomed.id)
    if (error || !data.length) {
      setDeleteError(error ? friendlyError(error) : NOT_A_DRAFT)
      await qc.invalidateQueries({ queryKey: ['campaigns', orgId] })
      return
    }
    setDoomed(null)
    setNotice(`${doomed.name} deleted.`)
    await qc.invalidateQueries({ queryKey: ['campaigns', orgId] })
    focusLater('campaigns-h') // the row that held the Delete button is gone
  })

  const rows = list.data?.rows ?? []
  const firstRun = list.isSuccess && !rows.length
  const statsFailed = list.isSuccess && stats.isError
  return (
    <section aria-labelledby="campaigns-h">
      <PageHead id="campaigns-h" crumb="Build · Campaigns" title="Campaigns" accent={false}>
        {!!rows.length && <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => setCreating(true)}><PlusIcon />New campaign<kbd className="rnr-kbd" aria-hidden="true">N</kbd></button>}
      </PageHead>
      <div className="flex flex-col gap-4">
        <p className="rnr-caption" role="status">{notice}</p>
        {list.isPending && <Skeleton rows={[{ w: '100%', h: 200 }]} />}
        {list.isError && <LoadError what="The campaigns" onRetry={() => void list.refetch()} />}
        {firstRun && (
          <div className="rnr-empty">
            <span className="rnr-kind"><NAV_ICONS.campaigns size={20} /></span>
            <h2>Send your first campaign</h2>
            <p>Email a role or the people in a report, schedule it, and see who opened it and who finished the workflow.</p>
            <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => setCreating(true)}><PlusIcon />New campaign</button>
          </div>
        )}
        {statsFailed && <Note role="alert">The numbers did not load. Reload the page to try again.</Note>}
        {!!rows.length && (
          <div className="rnr-card rnr-table-card">
            <table className="rnr-table rnr-sticky-first">
              <caption className="sr-only">Campaigns in {orgs.find((o) => o.id === orgId)?.name ?? 'your organisation'}, newest first</caption>
              <thead><tr>
                <th scope="col">Name</th><th scope="col">Status</th><th scope="col" className="num">Date</th>
                <th scope="col" className="num">Delivered</th><th scope="col" className="num">Opened</th><th scope="col" className="num">Clicked</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {rows.map((c) => {
                  const when = sendDate(c)
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.name}</th>
                      <td><CampaignStatusMark status={c.status} /></td>
                      <td className="num whitespace-nowrap">{when ? <When iso={when} /> : <span className="rnr-muted">Not scheduled</span>}</td>
                      <Numbers c={c} stats={stats} />
                      <td>
                        <div className="flex justify-end gap-1 whitespace-nowrap">
                          <a className="rnr-btn rnr-btn-secondary rnr-btn-sm" href={`#/campaigns/${c.id}`} aria-label={`Open ${c.name}`}>Open</a>
                          {c.status === 'draft' && <button type="button" className="rnr-btn rnr-btn-danger rnr-btn-sm" aria-label={`Delete ${c.name}`} onClick={() => { setDeleteError(null); setDoomed(c) }}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > rows.length && (
          <p className="rnr-caption">Showing the newest {CAMPAIGN_LIST_LIMIT} of {list.data.total.toLocaleString('en-GB')} campaigns.</p>
        )}
      </div>
      {creating && <NewCampaignDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!doomed} title={`Delete ${doomed?.name ?? ''}?`} body={`${doomed?.name ?? ''} is a draft and will be deleted for everyone. It cannot be recovered.`}
        confirmLabel="Delete draft" busyLabel="Deleting…" busy={removal.busy} error={deleteError}
        onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} />
    </section>
  )
}

/** The three percentage cells: one "Not sent yet" cell for a campaign that never sent, "Not tracked" for what in-app cannot measure. */
function Numbers({ c, stats }: { c: Campaign; stats: ReturnType<typeof useCampaignStats> }) {
  if (c.status === 'draft' || c.status === 'scheduled' || c.status === 'failed') return <td colSpan={3} className="rnr-muted">Not sent yet</td>
  if (stats.isError) return <><td className="num rnr-muted">Not loaded</td><td className="num rnr-muted">Not loaded</td><td className="num rnr-muted">Not loaded</td></>
  if (!stats.data) return <><td className="num rnr-muted">Loading…</td><td className="num rnr-muted">Loading…</td><td className="num rnr-muted">Loading…</td></>
  const s = statsOf(stats.data, c.id)
  if (c.channel === 'in_app') {
    const read = pct(s.opened, s.recipients)
    return <><td className="num"><span className="rnr-muted">Not tracked</span></td><td className="num">{read === null ? pctText(read) : `${pctText(read)} read`}</td><td className="num"><span className="rnr-muted">Not tracked</span></td></>
  }
  return <><td className="num">{pctText(pct(s.delivered, s.recipients))}</td><td className="num">{pctText(pct(s.opened, s.delivered))}</td><td className="num">{pctText(pct(s.clicked, s.delivered))}</td></>
}

function NewCampaignDialog({ onClose }: { onClose(): void }) {
  const { orgId } = useOrg()
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const act = useAction()
  const qc = useQueryClient()
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act.run(async () => {
      if (!name.trim()) { setError('Enter a name for the campaign.'); document.getElementById(`${uid}-n`)?.focus(); return }
      const { data, error: e2 } = await createCampaign(orgId!, { name: name.trim() })
      if (e2) { setError(friendlyError(e2)); return }
      await qc.invalidateQueries({ queryKey: ['campaigns', orgId] }) // the list must not show its old first-run state when the person comes back
      markFocus(data.id) // the editor's heading takes focus: the dialog that held it is gone
      location.hash = `#/campaigns/${data.id}`
    })
  }
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>New campaign</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="rnr-dialog-body">
          <div className="rnr-field" data-invalid={!!error || undefined}>
            <label className="rnr-label" htmlFor={`${uid}-n`}>Name</label>
            <input id={`${uid}-n`} data-autofocus className="rnr-input" value={name} maxLength={120} aria-invalid={!!error || undefined}
              aria-describedby={error ? `${uid}-e` : undefined} onChange={(e) => setName(e.target.value)} />
          </div>
          {error && <FieldError id={`${uid}-e`} role="alert">{error}</FieldError>}
        </div>
        <div className="rnr-dialog-foot">
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={act.busy}>
            {act.busy && <span className="rnr-spin" aria-hidden="true" />}{act.busy ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
