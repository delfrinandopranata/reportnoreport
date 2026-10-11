import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemberEmails } from '../members/useMemberEmails'
import { useOrg } from '../rbac/useOrg'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon, PencilIcon, StopIcon } from '../ui/icons'
import { setNavGuard, type Next } from '../ui/navGuard'
import { FolderCard } from '../ui/FolderCard'
import { Skeleton } from '../ui/Skeleton'
import { useAction } from '../ui/useAction'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { deleteTemplate, updateTemplate, usePreviewRecords, useTemplate, type TemplateFields, type TemplateRow } from './api'
import { setListArrival } from './arrival'
import { CHANNEL_WORDS, DELETE_TEMPLATE_BODY } from './channels'
import { insertToken } from './insert'
import { DATA_PREFIX, KIND_LABELS, isVariable, render } from './logic'
import { previewContext } from './preview'
import { LIMITS, validateTemplate, type TemplateErrors } from './validate'
import { FieldError, Note } from './Note'
import { PageHead } from './PageHead'
import { VariableMenu } from './VariableMenu'

type Target = 'subject' | 'body'

export function TemplateEditor({ id }: { id: string }) {
  const { orgId } = useOrg()
  const tpl = useTemplate(id)
  const qc = useQueryClient()
  // Remounting the form is explicit (Reload template), never a side effect of a background refetch that would discard edits.
  const [epoch, setEpoch] = useState(0)
  const reload = async () => {
    await qc.refetchQueries({ queryKey: ['template', id] })
    setEpoch((n) => n + 1)
  }
  const card = (title: string, text: string, action?: React.ReactNode) => (
    <div className="rnr-empty"><h1 className="rnr-heading">{title}</h1><p>{text}</p>{action}</div>
  )
  return (
    <div className="flex flex-col gap-4">
      <a className="rnr-crumb mb-2 self-start" href="#/templates"><BackIcon />Back to templates</a>
      {tpl.isPending && <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />}
      {tpl.isError && card('This template did not load', 'Check your connection and try again.',
        <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void tpl.refetch()}>Try again</button>)}
      {tpl.isSuccess && (!tpl.data || tpl.data.org_id !== orgId) && card('This template does not exist', 'It may have been deleted, or it belongs to another organisation.')}
      {tpl.data && tpl.data.org_id === orgId && <Editor key={`${tpl.data.id}:${epoch}`} tpl={tpl.data} reloaded={epoch > 0} onReload={reload} />}
    </div>
  )
}

function Editor({ tpl, reloaded, onReload }: { tpl: TemplateRow; reloaded: boolean; onReload(): Promise<void> }) {
  const { orgId, orgs, userId } = useOrg()
  const qc = useQueryClient()
  const emails = useMemberEmails(orgId)
  const records = usePreviewRecords(orgId)
  const [f, setF] = useState<TemplateFields>({ name: tpl.name, channel: tpl.channel, subject: tpl.subject, body: tpl.body })
  const [saved, setSaved] = useState<TemplateFields>(f)
  const [version, setVersion] = useState(tpl.updated_at)
  const [errors, setErrors] = useState<TemplateErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [recordId, setRecordId] = useState('')
  const [target, setTarget] = useState<Target>('body')
  const [unknownShown, setUnknownShown] = useState<string[]>([])
  const [notice, setNotice] = useNotice(reloaded ? 'Template reloaded.' : null)
  const save = useAction()
  const removal = useAction()
  const reloading = useAction()
  const focusLater = useFocusAfterRender()
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const uid = useId()
  const dirty = (Object.keys(f) as (keyof TemplateFields)[]).some((k) => f[k] !== saved[k])

  useEffect(() => { if (reloaded) document.getElementById('tpl-h')?.focus() }, [reloaded])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === `#/templates/${tpl.id}`) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, tpl.id])

  const record = records.data?.find((r) => r.id === recordId) ?? null
  const preview = useMemo(() => render(f, previewContext(record, {
    orgName: orgs.find((o) => o.id === orgId)?.name ?? '', myName: emails.data?.get(userId) ?? 'You', appUrl: `${location.origin}/app/`,
  })), [f, record, orgs, orgId, emails.data, userId])
  const answerKeys = record ? Object.keys(record.data).filter((k) => isVariable(`${DATA_PREFIX}${k}`)) : null

  // The unknown-variable line is polite and settles for 600ms first, so a screen reader hears text, not each keystroke.
  const unknownKey = preview.unknown.join(' ')
  useEffect(() => {
    const t = setTimeout(() => setUnknownShown(unknownKey ? unknownKey.split(' ') : []), 600)
    return () => clearTimeout(t)
  }, [unknownKey])

  const insert = (key: string, label: string) => {
    const field = target
    const el = field === 'subject' ? subjectRef.current : bodyRef.current
    const r = insertToken(f[field], el?.selectionStart ?? null, el?.selectionEnd ?? null, `{{${key}}}`)
    setF({ ...f, [field]: r.value })
    setNotice(`Inserted “${label}” in the ${field === 'subject' ? 'subject' : 'message'}.`)
    focusLater(() => {
      const node = field === 'subject' ? subjectRef.current : bodyRef.current
      node?.setSelectionRange(r.caret, r.caret)
      return node
    })
  }

  const submit = () => save.run(async () => {
    const next = validateTemplate(f)
    setErrors(next)
    setError(null)
    const first = Object.keys(next)[0]
    if (first) { focusLater(`${uid}-${first}`); return false }
    const body = { ...f, name: f.name.trim() }
    const { data, error: e } = await updateTemplate(tpl.id, body, version)
    if (e) { setError(friendlyError(e)); return false }
    if (!data?.length) { setConflict(true); return false }
    setConflict(false)
    setVersion(data[0].updated_at)
    setSaved(body)
    setF(body)
    qc.setQueryData(['template', tpl.id], { ...tpl, ...body, updated_at: data[0].updated_at }) // a later visit must not start from stale words
    void qc.invalidateQueries({ queryKey: ['templates', orgId] })
    setNotice('Template saved.')
    return true
  }, true)

  const confirmDelete = () => removal.run(async () => {
    const { data, error: e } = await deleteTemplate(tpl.id)
    if (e || !data?.length) { setDeleteError(e ? friendlyError(e) : 'You do not have permission to do that.'); return }
    setNavGuard(null)
    setListArrival(`${tpl.name} deleted.`)
    await qc.invalidateQueries({ queryKey: ['templates', orgId] })
    location.hash = '#/templates'
  })

  const field = (k: 'name' | 'subject', label: string, hint?: string, ref?: RefObject<HTMLInputElement | null>) => (
    <div className="rnr-field" data-invalid={errors[k] ? true : undefined}>
      <label className="rnr-label" htmlFor={`${uid}-${k}`}>{label}</label>
      <input id={`${uid}-${k}`} ref={ref} className="rnr-input" value={f[k]} required={k === 'name'} maxLength={LIMITS[k]} aria-invalid={errors[k] ? true : undefined}
        aria-describedby={[hint && `${uid}-${k}-hint`, errors[k] && `${uid}-${k}-err`].filter(Boolean).join(' ') || undefined}
        onFocus={() => { if (k === 'subject') setTarget('subject') }} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {hint && <p id={`${uid}-${k}-hint`} className="rnr-hint">{hint}</p>}
      {errors[k] && <FieldError id={`${uid}-${k}-err`}>{errors[k]}</FieldError>}
    </div>
  )

  return (
    <>
      <PageHead id="tpl-h" crumb="Build · Templates" title="Edit template" lede={tpl.is_system ? `System template for ${KIND_LABELS[tpl.kind]}. You can change its words and channel; it cannot be deleted.` : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <FolderCard tab="Template" headingId={`${uid}-tab`}>
            <div className="flex flex-col gap-4">
              {field('name', 'Name')}
              <div className="rnr-field">
                <span className="rnr-label" id={`${uid}-ch`}>Channel</span>
                <div className="rnr-seg self-start" role="group" aria-labelledby={`${uid}-ch`}>
                  {(['email', 'in_app'] as const).map((c) => (
                    <button key={c} type="button" aria-pressed={f.channel === c} onClick={() => setF({ ...f, channel: c })}>{CHANNEL_WORDS[c]}</button>
                  ))}
                </div>
                <p className="rnr-hint">
                  {tpl.kind === 'invite'
                    ? 'Invitations are always emailed, whatever you choose here.'
                    : 'Members always get an in-app notification. Email also goes out unless they turned this type off.'}
                </p>
              </div>
              {field('subject', 'Subject', 'One line. Line breaks are removed.', subjectRef)}
              <div className="rnr-field" data-invalid={errors.body ? true : undefined}>
                <label className="rnr-label" htmlFor={`${uid}-body`}>Message</label>
                <textarea id={`${uid}-body`} ref={bodyRef} className="rnr-input" rows={10} maxLength={LIMITS.body} value={f.body} aria-invalid={errors.body ? true : undefined}
                  aria-describedby={`${uid}-body-hint${errors.body ? ` ${uid}-body-err` : ''}`}
                  onFocus={() => setTarget('body')} onChange={(e) => setF({ ...f, body: e.target.value })} />
                <p id={`${uid}-body-hint`} className="rnr-hint">
                  Plain text. A blank line starts a new paragraph. Variables such as {'{{org.name}}'} are filled in when the message is sent,
                  and whatever they contain is shown exactly as typed, never as formatting.
                </p>
                {errors.body && <FieldError id={`${uid}-body-err`}>{errors.body}</FieldError>}
              </div>
              <VariableMenu answers={answerKeys} recordTitle={record?.title ?? null} target={target === 'subject' ? 'subject' : 'message'} onPick={insert} />
              {unknownShown.length > 0 && (
                <p className="rnr-status" data-tone="warn" data-wrap aria-live="polite"><StopIcon size={14} />Not a variable, so it will be left empty: {unknownShown.map((u) => `{{${u}}}`).join(', ')}</p>
              )}
              {error && <Note role="alert">{error}</Note>}
              {conflict && (
                <Note role="alert">
                  <p>This template was changed by someone else. Reload to see their changes.</p>
                  <button type="button" className="rnr-btn rnr-btn-secondary mt-2" aria-busy={reloading.busy} onClick={() => void reloading.run(onReload)}>
                    {reloading.busy && <span className="rnr-spin" aria-hidden="true" />}{reloading.busy ? 'Reloading…' : 'Reload template'}
                  </button>
                  <p className="rnr-caption mt-2">Reloading discards your unsaved changes.</p>
                </Note>
              )}
              <div className="rnr-actions">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" className="rnr-btn rnr-btn-primary" aria-busy={save.busy}>
                    {save.busy && <span className="rnr-spin" aria-hidden="true" />}
                    {save.saved && !save.busy && <span className="rnr-pop" aria-hidden="true"><CheckIcon /></span>}
                    {save.busy ? 'Saving…' : save.saved ? 'Saved' : 'Save template'}
                  </button>
                  {dirty && <span className="rnr-status"><PencilIcon size={14} />Unsaved changes</span>}
                </div>
                {!tpl.is_system && <button type="button" className="rnr-btn rnr-btn-danger" onClick={() => { setDeleteError(null); setDeleting(true) }}>Delete template</button>}
              </div>
              <p className="rnr-caption" role="status">{notice}</p>
            </div>
          </FolderCard>
        </form>
        <FolderCard tab="Preview" headingId={`${uid}-pv`} className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-col gap-3">
            <div className="rnr-field">
              <label className="rnr-label" htmlFor={`${uid}-rec`}>Record to preview with</label>
              <div className="rnr-select">
                <select id={`${uid}-rec`} className="rnr-input" value={recordId}
                  onChange={(e) => {
                    setRecordId(e.target.value)
                    const picked = records.data?.find((r) => r.id === e.target.value)
                    setNotice(picked ? `Previewing with ${picked.title}.` : 'Previewing with example values.')
                  }}>
                  {records.isPending
                    ? <option value="">Loading records…</option>
                    : <><option value="">No record (example values)</option>{records.data?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</>}
                </select>
              </div>
              <p className="rnr-hint">You stand in for the recipient and the step assignee. Links are filled in when the message is sent.</p>
              {records.isError && <FieldError>Records to preview with did not load. Example values are shown.</FieldError>}
              {records.isSuccess && records.data.length === 0 && <p className="rnr-hint">No records to preview with yet. Example values are shown.</p>}
            </div>
            <div>
              <p className="rnr-caption">Subject</p>
              {preview.subject ? <p className="rnr-label">{preview.subject}</p> : <p className="rnr-label rnr-muted">No subject</p>}
            </div>
            <div>
              <p className="rnr-caption">Message</p>
              <div className="rnr-preview">{preview.text}</div>
            </div>
            <p className="rnr-caption">Preview is plain text. The email shows the same words with clickable links.</p>
          </div>
        </FolderCard>
      </div>
      <ConfirmDialog open={!!leaveTo} title="Leave without saving?" body={`Your changes to ${f.name.trim() || 'this template'} will be lost.`}
        confirmLabel="Leave without saving" busyLabel="Leaving…" busy={false} error={null} onClose={() => setLeaveTo(null)}
        onConfirm={() => { const to = leaveTo; setNavGuard(null); setLeaveTo(null); if (typeof to === 'function') to(); else if (to) location.hash = to }} />
      <ConfirmDialog open={deleting} title={`Delete ${tpl.name}?`} body={DELETE_TEMPLATE_BODY(tpl.name)} confirmLabel="Delete template" busyLabel="Deleting…"
        busy={removal.busy} error={deleteError} onClose={() => { setDeleting(false); setDeleteError(null) }} onConfirm={() => void confirmDelete()} />
    </>
  )
}
