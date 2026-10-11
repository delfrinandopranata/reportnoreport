import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { DownloadIcon, XIcon } from '../ui/icons'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useNotice } from '../ui/useNotice'
import type { RecordStatus } from '../workflows/api'
import { requestPdf, usePdfUrl, useRecordPdf, useReportTemplate } from './api'
import { csvFilename } from './logic'

const SLOW_MS = 60_000

/** Latest PDF of a record and the button that makes one. Hidden when there is nothing to show and nothing to do. */
export function PdfPanel({ recordId, workflowId, recordTitle, recordStatus }: { recordId: string; workflowId: string; recordTitle: string; recordStatus: RecordStatus }) {
  const { can } = useOrg()
  const mayRequest = can('reports.view')
  const template = useReportTemplate(workflowId)
  const pdf = useRecordPdf(recordId)
  const latest = pdf.data ?? null
  const status = latest?.status
  const made = latest?.finished_at ?? latest?.created_at ?? ''
  const downloadName = csvFilename(recordTitle, made.slice(0, 10)).replace(/\.csv$/, '.pdf')
  const path = status === 'done' ? latest!.path : null
  const open = usePdfUrl(path)
  const save = usePdfUrl(path, downloadName)
  const qc = useQueryClient()
  const act = useAction()
  const [announce, setAnnounce] = useNotice()
  const [error, setError] = useState<string | null>(null)
  const [slowJob, setSlowJob] = useState<string | null>(null)
  const seen = useRef<string | undefined>(undefined)

  // Only transitions seen in this session are announced; the first load is silent.
  useEffect(() => {
    if (seen.current === 'queued' && status === 'done') setAnnounce('The PDF is ready.')
    if (seen.current === 'queued' && status === 'failed') setAnnounce('The PDF could not be made.')
    seen.current = status
  }, [status, setAnnounce])
  useEffect(() => {
    if (status !== 'queued') return
    const job = latest!.id
    const t = setTimeout(() => setSlowJob(job), Math.max(0, new Date(latest!.created_at).getTime() + SLOW_MS - Date.now()))
    return () => clearTimeout(t)
  }, [status, latest?.id, latest?.created_at])

  if (template.isPending || pdf.isPending) return null // the record page is already painted; the panel appears when known
  if (pdf.isError || template.isError) {
    return (
      <section className="rnr-card gap-2" aria-label="PDF">
        <p role="alert">We could not load the PDF for this record. Check your connection and try again.</p>
        <div><button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => { void pdf.refetch(); void template.refetch() }}>Try again</button></div>
      </section>
    )
  }
  if (!template.data && !latest) {
    if (!can('reports.manage')) return null
    return (
      <section className="rnr-card gap-2" aria-labelledby="pdf-h">
        <h2 id="pdf-h" className="dialog-title">PDF</h2>
        <p className="rnr-muted">This workflow has no PDF template yet, so its records cannot be made into PDFs.</p>
        <div><a className="rnr-btn rnr-btn-secondary" href={`#/workflows/${workflowId}/report`}>Set up a PDF template</a></div>
      </section>
    )
  }
  if (!latest && !mayRequest) return null

  const queued = status === 'queued'
  const busy = act.busy || queued
  const generate = () => {
    if (busy) return // a second press is a no-op; the server would return the same job
    void act.run(async () => {
      setError(null)
      const { error: e } = await requestPdf(recordId)
      if (e) { setError(friendlyError(e)); return false }
      setAnnounce('PDF requested. It will be ready in a few seconds.')
      await qc.invalidateQueries({ queryKey: ['record-pdfs', recordId] })
    })
  }
  const primaryGenerate = status !== 'done'
  return (
    <section className="rnr-card gap-3" aria-labelledby="pdf-h">
      <h2 id="pdf-h" className="dialog-title">PDF</h2>
      {!latest && <p className="rnr-muted">No PDF has been made for this record yet.</p>}
      {queued && <p className="rnr-status"><span className="rnr-spin" aria-hidden="true" />Making the PDF…</p>}
      {queued && slowJob === latest?.id && <p className="rnr-caption">This is taking longer than usual. You can leave this page. The PDF appears here when it is ready.</p>}
      {status === 'done' && <p className="rnr-muted">Made <When iso={made} />.</p>}
      {status === 'failed' && (
        <>
          <p className="rnr-status" data-wrap><XIcon size={14} />PDF not made</p>
          <p className="rnr-muted">{latest?.error ?? 'The PDF could not be made.'}</p>
          {recordStatus === 'error' && <p className="rnr-caption">The record stays stopped. A new PDF does not restart it.</p>}
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {status === 'done' && open.data && (
          <a className="rnr-btn rnr-btn-primary" href={open.data} target="_blank" rel="noopener noreferrer">Open PDF<span className="sr-only"> (opens in a new tab)</span></a>
        )}
        {status === 'done' && save.data && <a className="rnr-btn rnr-btn-secondary" href={save.data} download={downloadName}><DownloadIcon />Download PDF</a>}
        {mayRequest && template.data && (
          <button key="generate" type="button" className={`rnr-btn ${primaryGenerate ? 'rnr-btn-primary' : 'rnr-btn-ghost'}`} aria-busy={busy} onClick={generate}>
            {busy && <span className="rnr-spin" aria-hidden="true" />}
            {busy ? 'Generating…' : status === 'failed' ? 'Try again' : latest ? 'Generate new PDF' : 'Generate PDF'}
          </button>
        )}
      </div>
      <p className="rnr-caption">Times in the PDF are shown in UTC.</p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</p>
      {(open.isError || save.isError) && <p className="rnr-error" role="alert">We could not open the PDF. Reload the page and try again.</p>}
      {error && <p className="rnr-error" role="alert">{error}</p>}
    </section>
  )
}
