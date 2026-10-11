import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import { useMemberEmails } from '../../members/useMemberEmails'
import { useOrg } from '../../rbac/useOrg'
import { Skeleton } from '../../ui/Skeleton'
import type { Answers, Field } from '../logic'
import type { LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { AnswerList } from './AnswerList'

type Sub = { id: string; answers: Answers; submitted_by: string; created_at: string }
const LIMIT = 200 // shortcut: newest 200 only; paging arrives with aggregate reports (Phase 5)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function Row({ sub, fields, by }: { sub: Sub; fields: Field[]; by: string }) {
  const [open, setOpen] = useState(false) // file links are signed only for rows that are open
  return (
    <li className="rnr-card">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="rnr-focus" style={{ cursor: 'pointer' }}><span className="label">{by}</span> <span className="rnr-muted">· {when(sub.created_at)}</span></summary>
        {open && <div className="pt-3"><AnswerList fields={fields} answers={sub.answers} createdAt={sub.created_at} by={by} /></div>}
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
  const emails = useMemberEmails(orgId)
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
