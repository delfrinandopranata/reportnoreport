import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../data/supabase'
import type { Answers, Field } from '../logic'
import { fileName } from '../paths'
import { FILE_BUCKET } from '../upload'
import { formatDay, hiddenKeys } from './display'

function FileLink({ path, image, by }: { path: string; image: boolean; by: string }) {
  const url = useQuery({ queryKey: ['signed', path], staleTime: 50 * 60_000, queryFn: async () => {
    const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  } })
  const name = fileName(path)
  if (url.isPending) return <span className="rnr-muted">Loading…</span>
  if (url.isError) return <span className="rnr-error">This file did not open. Reload the page to try again.</span>
  return image
    ? <img src={url.data} alt={`Signature of ${by}`} className="max-h-24 max-w-full rounded-[var(--r-ctl)] border border-line bg-surface object-contain p-1" />
    : <a href={url.data} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} (opens in a new tab)`}>Open {name}</a>
}

const Pair = ({ label, children }: { label: string; children: ReactNode }) => (
  <><dt>{label}</dt><dd>{children}</dd></>
)

function Value({ field: f, value, by }: { field: Field; value: unknown; by: string }) {
  if (value === undefined || value === null || value === '') return <span className="rnr-muted">Not answered</span>
  if (f.type === 'date' && typeof value === 'string') return <span className="rnr-num">{formatDay(value)}</span>
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
            <dl className="rnr-review">{(f.fields ?? []).map((c) => <Pair key={c.key} label={c.label}><Value field={c} value={row[c.key]} by={by} /></Pair>)}</dl>
          </div>
        ))}
      </div>
    )
  }
  return <>{String(value)}</>
}

/** Answers as submitted; fields hidden by show_if at submit time are left out rather than shown as "Not answered". */
export function AnswerList({ fields, answers, createdAt, by }: { fields: Field[]; answers: Answers; createdAt: string; by: string }) {
  const hidden = hiddenKeys(fields, answers, createdAt)
  return (
    <dl className="rnr-review">
      {fields.filter((f) => f.type !== 'page_break' && !hidden.has(f.key)).map((f) => (
        <Pair key={f.key} label={f.label}><Value field={f} value={answers[f.key]} by={by} /></Pair>
      ))}
    </dl>
  )
}
