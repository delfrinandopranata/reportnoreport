import { PdfProblem, readTemplate, type PdfSource } from '../_shared/reports/index.ts'
import type { PdfJob, Result, Store, Tx } from '../advance/engine.ts'

export type Deps = {
  authorised: boolean; store: Store; now(): Date
  render(src: PdfSource, now: Date): Promise<Uint8Array>
  upload(path: string, bytes: Uint8Array): Promise<void>
}
type Outcome = 'done' | 'retrying' | 'failed'

export const MAX_PDF_ATTEMPTS = 3
export const LEASE_MS = 5 * 60_000 // a worker that dies mid-render frees its job after this
/** 1 then 2 minutes after the 1st and 2nd failure. */
export const pdfBackoffMs = (attempts: number) => 60_000 * 2 ** (attempts - 1)
export const PDF_FAILED = 'The PDF could not be made. Try again in a few minutes.'
const BATCH = 10 // shortcut: 10 PDFs per wake-up; every request wakes the worker again, raise it when bursts queue up
const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 199)}…` : s)

/** Woken by request_record_pdf, by the engine's queuePdf, and by pg_cron every minute. */
export async function renderPdfs(deps: Deps): Promise<Result> {
  if (!deps.authorised) return { status: 401, body: { error: 'Not allowed.' } }
  const now = deps.now()
  const counts = { done: 0, retrying: 0, failed: 0 }
  for (const job of await deps.store.tx((tx) => tx.expiredPdfs(now, BATCH))) {
    if (await deps.store.tx((tx) => failJob(tx, job, PDF_FAILED))) counts.failed += 1
  }
  for (const id of await deps.store.tx((tx) => tx.duePdfs(now, BATCH))) {
    const r = await renderOne(deps, id, now)
    if (r) counts[r] += 1
  }
  return { status: 200, body: counts }
}

async function renderOne(deps: Deps, id: string, now: Date): Promise<Outcome | null> {
  const job = await deps.store.tx((tx) => tx.claimPdf(id, now, new Date(now.getTime() + LEASE_MS)))
  if (!job) return null // another run has it
  const path = `${job.org_id}/${job.record_id}/${job.id}.pdf`
  let title = ''
  try {
    const row = await deps.store.tx((tx) => tx.pdfSource(job.record_id))
    if (!row) throw new PdfProblem('This record or its report template no longer exists, so the PDF was not made.')
    const template = readTemplate(row.template)
    if (!template) throw new PdfProblem('The report template could not be read, so the PDF was not made. Ask a reports manager to open and save it.')
    title = row.record.title
    await deps.upload(path, await deps.render({ ...row, template }, now))
  } catch (e) {
    const permanent = e instanceof PdfProblem
    if (!permanent) console.error('render-pdfs: attempt failed', job.id, e) // detail stays in the log; people read PDF_FAILED
    const message = permanent ? e.message : PDF_FAILED
    if (!permanent && job.attempts < MAX_PDF_ATTEMPTS) {
      await deps.store.tx((tx) => tx.finishPdf(job.id, { status: 'queued', error: message, nextAttemptAt: new Date(now.getTime() + pdfBackoffMs(job.attempts)) }))
      return 'retrying'
    }
    return (await deps.store.tx((tx) => failJob(tx, job, message))) ? 'failed' : null
  }
  const finished = await deps.store.tx(async (tx) => {
    await tx.lockRecord(job.record_id) // record first, then the job: the order advance uses
    if (!(await tx.finishPdf(job.id, { status: 'done', error: null, path }))) return false
    await tx.event({ org_id: job.org_id, record_id: job.record_id, kind: 'action', node_id: null, actor_id: job.requested_by, detail: { type: 'generate_pdf', status: 'done', job: job.id } })
    if (job.requested_by) {
      await tx.notify([{ org_id: job.org_id, user_id: job.requested_by, kind: 'report_ready', title: clip(`PDF ready: ${title}`), body: '', link: `#/records/${job.record_id}` }])
    }
    return true
  })
  return finished ? 'done' : null
}

/** The last failure: the job, the timeline, the requester and an open record all say so (spec §5.4, §10). */
async function failJob(tx: Tx, job: PdfJob, message: string): Promise<boolean> {
  const rec = await tx.lockRecord(job.record_id) // record first, then the job
  if (!(await tx.finishPdf(job.id, { status: 'failed', error: message }))) return false
  if (!rec) return true
  await tx.event({ org_id: rec.org_id, record_id: rec.id, kind: 'error', node_id: rec.current_node_id, actor_id: null, detail: { type: 'generate_pdf', job: job.id, message } })
  if (rec.status === 'open') {
    rec.status = 'error'
    rec.error = message
    await tx.saveRecord(rec)
  }
  if (job.requested_by) {
    await tx.notify([{ org_id: rec.org_id, user_id: job.requested_by, kind: 'report_ready', title: clip(`PDF not made: ${rec.title}`), body: message, link: `#/records/${rec.id}` }])
  }
  return true
}
