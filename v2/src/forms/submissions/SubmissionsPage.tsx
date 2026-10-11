import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import { useOrg } from '../../rbac/useOrg'
import { Skeleton } from '../../ui/Skeleton'
import type { Answers, Field } from '../logic'
import type { LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { fileName } from '../paths'
import { FILE_BUCKET } from '../upload'

type Sub = { id: string; answers: Answers; submitted_by: string; created_at: string }
const LIMIT = 200 // shortcut: newest 200 only; paging arrives with aggregate reports (Phase 5)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function FileLink({ path, image, by }: { path: string; image: boolean; by: string }) {
  const url = useQuery({ queryKey: ['signed', path], staleTime: 50 * 60_000, queryFn: async () => {
    const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  } })
  const name = fileName(path)
  if (url.isPending) return <span className="rnr-muted">Loading…</span>
  if (url.isError) return <span className="rnr-error">We could not open this file. Reload the page to try again.</span>
  return image
    ? <img src={url.data} alt={`Signature of ${by}`} style={{ maxHeight: 96, maxWidth: '100%', objectFit: 'contain', background: '#fff', border: '1px solid var(--line-200)', borderRadius: 'var(--radius-lg)' }} />
    : <a href={url.data} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} (opens in a new tab)`}>Open {name}</a>
}

const Pair = ({ label, children }: { label: string; children: ReactNode }) => (
  <><dt className="rnr-fieldset-label">{label}</dt><dd>{children}</dd></>
)
const GRID = 'grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(120px,max-content)_1fr]'

function Value({ field: f, value, by }: { field: Field; value: unknown; by: string }) {
  if (value === undefined || value === null || value === '') return <span className="rnr-muted">Not answered</span>
  if (f.type === 'checkbox') return <>{value ? 'Yes' : 'No'}</>
  if (f.type === 'multi_select' && Array.isArray(value)) return <>{value.join(', ')}</>
  if ((f.type === 'file' || f.type === 'signature') && typeof value === 'string') return <FileLink path={value} image={f.type === 'signature'} by={by} />
  if (f.type === 'number' || f.type === 'calculated') return <span className="rnr-num">{Number(value).toLocaleString('en-GB')}</span>
  if (f.type === 'long_text') return <span className="whitespace-pre-wrap">{String(value)}</span>
  if (f.type === 'group' && Array.isArray(value)) {
    if (!value.length) return <span className="rnr-muted">No rows</span>
    return (
      <div className="flex flex-col gap-3">
        {(value as Answers[]).map((row, i) => (
          <div key={i}>
            <p className="rnr-caption">Row {i + 1}</p>
            <dl className={GRID}>{(f.fields ?? []).map((c) => <Pair key={c.key} label={c.label}><Value field={c} value={row[c.key]} by={by} /></Pair>)}</dl>
          </div>
        ))}
      </div>
    )
  }
  return <>{String(value)}</>
}

function Row({ sub, fields, by }: { sub: Sub; fields: Field[]; by: string }) {
  const [open, setOpen] = useState(false) // file links are signed only for rows that are open
  return (
    <li className="rnr-card">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="rnr-focus" style={{ cursor: 'pointer' }}><span className="label">{by}</span> <span className="rnr-muted">· {when(sub.created_at)}</span></summary>
        {open && (
          <dl className={`${GRID} pt-3`}>
            {fields.filter((f) => f.type !== 'page_break').map((f) => <Pair key={f.key} label={f.label}><Value field={f} value={sub.answers[f.key]} by={by} /></Pair>)}
          </dl>
        )}
      </details>
    </li>
  )
}

function Submissions({ form }: { form: LoadedForm }) {
  const { orgId, userId, can } = useOrg()
  const manage = can('forms.manage')
  const subs = useQuery({ queryKey: ['submissions', form.id], queryFn: async () => {
    const { data, error } = await supabase.from('form_submissions').select('id, answers, submitted_by, created_at')
      .eq('form_id', form.id).order('created_at', { ascending: false }).limit(LIMIT)
    if (error) throw error
    return data as unknown as Sub[]
  } })
  const emails = useQuery({ queryKey: ['member-emails', orgId], queryFn: async () => {
    const { data, error } = await supabase.from('members').select('user_id, email').eq('org_id', orgId!)
    if (error) throw error
    return new Map(data.filter((m) => m.user_id).map((m) => [m.user_id as string, m.email]))
  } })
  const who = (id: string) => (id === userId ? 'You' : (emails.data?.get(id) ?? 'Former member'))
  const n = subs.data?.length ?? 0
  return (
    <section className="flex flex-col gap-4" aria-labelledby="subs-h">
      <div>
        <h1 id="subs-h" tabIndex={-1} className="page-title">{manage ? 'Submissions' : 'Your submissions'}</h1>
        <p className="rnr-muted">{form.name}</p>
      </div>
      {subs.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {subs.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load the submissions. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => subs.refetch()}>Try again</button></div>
        </div>
      )}
      {subs.data?.length === 0 && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">{manage ? 'No submissions yet' : 'You have not submitted this form yet.'}</h2>
          <p className="rnr-muted">{manage ? 'Answers appear here as soon as someone submits this form.' : 'Answers you submit appear here.'}</p>
          <div><a className="rnr-btn rnr-btn-primary" href={`#/forms/${form.id}/fill`}>Fill in this form</a></div>
        </div>
      )}
      {n > 0 && <p className="rnr-caption">{n} {n === 1 ? 'submission' : 'submissions'}</p>}
      {n === LIMIT && <p className="rnr-caption">Showing the newest {LIMIT} submissions. Older ones are not shown yet.</p>}
      {n > 0 && <ul className="flex flex-col gap-3">{subs.data!.map((s) => <Row key={s.id} sub={s} fields={form.schema} by={who(s.submitted_by)} />)}</ul>}
    </section>
  )
}

export function SubmissionsPage({ id }: { id: string }) {
  return <FormGate id={id}>{(form) => <Submissions form={form} />}</FormGate>
}
