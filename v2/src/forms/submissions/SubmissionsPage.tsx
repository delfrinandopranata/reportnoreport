import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import { useMemberEmails } from '../../members/useMemberEmails'
import { useOrg } from '../../rbac/useOrg'
import { FolderCard } from '../../ui/FolderCard'
import { NAV_ICONS } from '../../ui/icons'
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
    <li>
      <FolderCard tab={by}>
        <details onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer"><span className="rnr-num">{when(sub.created_at)}</span></summary>
          {open && <div className="pt-3"><AnswerList fields={fields} answers={sub.answers} createdAt={sub.created_at} by={by} /></div>}
        </details>
      </FolderCard>
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
      <header className="rnr-page-head">
        <div>
          <p className="rnr-micro">Build · {form.name}</p>
          <h1 id="subs-h" tabIndex={-1} className="rnr-page-title">{manage ? 'Submissions' : <>Your <em>submissions</em></>}</h1>
        </div>
      </header>
      {subs.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {subs.isError && (
        <div className="rnr-empty" role="alert">
          <span className="rnr-kind"><NAV_ICONS.forms size={20} /></span>
          <h2>The submissions did not load</h2>
          <p>Check your connection, then try again.</p>
          <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => subs.refetch()}>Try again</button>
        </div>
      )}
      {subs.data?.length === 0 && (
        <div className="rnr-empty">
          <span className="rnr-kind"><NAV_ICONS.forms size={20} /></span>
          <h2>{manage ? 'No submissions yet' : 'You have not submitted this form yet.'}</h2>
          <p>{manage ? 'Answers appear here as soon as someone submits this form.' : 'Answers you submit appear here.'}</p>
          <a className="rnr-btn rnr-btn-primary" href={`#/forms/${form.id}/fill`}>Fill in this form</a>
        </div>
      )}
      {n > 0 && <p className="rnr-caption">{n} {n === 1 ? 'submission' : 'submissions'}</p>}
      {n === LIMIT && <p className="rnr-caption">Showing the newest {LIMIT} submissions. Older ones are not shown yet.</p>}
      {n > 0 && <ul className="flex flex-col gap-6">{subs.data!.map((s) => <Row key={s.id} sub={s} fields={form.schema} by={who(s.submitted_by)} />)}</ul>}
    </section>
  )
}

export function SubmissionsPage({ id }: { id: string }) {
  return <FormGate id={id}>{(form) => <Submissions form={form} />}</FormGate>
}
