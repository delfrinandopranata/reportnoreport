import { assertEquals } from 'jsr:@std/assert@1'
import { setup, NOW } from '../advance/testkit.ts'
import { PdfProblem } from '../_shared/reports/pdf.ts'
import { SOURCE } from '../_shared/reports/fixture.ts'
import { ORG } from '../_shared/forms/fixture.ts'
import { MEMBER } from '../_shared/workflow/fixture.ts'
import { PDF_FAILED, renderPdfs, type Deps } from './handler.ts'

const min = (n: number) => new Date(NOW.getTime() + n * 60_000)

/** A started record with one PDF job the member asked for, and a source for it. */
async function withJob(status: 'open' | 'done' = 'open') {
  const s = setup()
  await s.start()
  const rec = s.db.records[0]
  rec.status = status
  const job = await s.store.tx((tx) => tx.queuePdf({ org_id: ORG, record_id: rec.id, requested_by: MEMBER }))
  s.db.pdfSources.set(rec.id, { ...structuredClone(SOURCE), record: { ...SOURCE.record, id: rec.id } })
  const uploads: string[] = []
  const deps = (over: Partial<Deps> = {}, at = NOW): Deps => ({
    authorised: true, store: s.store, now: () => at,
    render: () => Promise.resolve(new Uint8Array([37, 80, 68, 70])),
    upload: (path) => { uploads.push(path); return Promise.resolve() },
    ...over,
  })
  return { ...s, rec, job, uploads, deps }
}

Deno.test('renders a queued PDF, uploads it under the org and record, and tells the requester', async () => {
  const { db, rec, job, uploads, deps } = await withJob()
  assertEquals((await renderPdfs(deps())).body, { done: 1, retrying: 0, failed: 0 })
  assertEquals(uploads, [`${ORG}/${rec.id}/${job}.pdf`])
  assertEquals([db.pdfs[0].status, db.pdfs[0].path, db.pdfs[0].attempts], ['done', uploads[0], 1])
  assertEquals(db.events.at(-1)?.detail, { type: 'generate_pdf', status: 'done', job })
  assertEquals(db.notifications.at(-1), { org_id: ORG, user_id: MEMBER, kind: 'report_ready', title: `PDF ready: ${SOURCE.record.title}`, body: '', link: `#/records/${rec.id}` })
})

Deno.test('a failing render retries after 1 and 2 minutes, then fails with a plain reason and stops an open record', async () => {
  const { db, deps } = await withJob()
  const boom = { render: () => Promise.reject(new Error('ENOENT /var/tmp/internal path')) }
  assertEquals((await renderPdfs(deps(boom))).body, { done: 0, retrying: 1, failed: 0 })
  assertEquals(db.pdfs[0].next_attempt_at, min(1))
  assertEquals((await renderPdfs(deps(boom, min(0.5)))).body, { done: 0, retrying: 0, failed: 0 }) // not due yet
  assertEquals((await renderPdfs(deps(boom, min(1)))).body, { done: 0, retrying: 1, failed: 0 })
  assertEquals(db.pdfs[0].next_attempt_at, min(3))
  assertEquals((await renderPdfs(deps(boom, min(3)))).body, { done: 0, retrying: 0, failed: 1 })
  assertEquals([db.pdfs[0].status, db.pdfs[0].attempts, db.pdfs[0].error], ['failed', 3, PDF_FAILED])
  assertEquals([db.records[0].status, db.records[0].error], ['error', PDF_FAILED])
  assertEquals(db.events.at(-1)?.kind, 'error')
  assertEquals(JSON.stringify(db).includes('ENOENT'), false) // the exception text never reaches people
  assertEquals(db.notifications.at(-1)?.title.startsWith('PDF not made: '), true)
})

Deno.test('a missing signature fails at once and stops an open record', async () => {
  const { db, deps } = await withJob()
  const missing = 'A signature file is missing, so the PDF was not made. Ask the person to sign again.'
  assertEquals((await renderPdfs(deps({ render: () => Promise.reject(new PdfProblem(missing)) }))).body, { done: 0, retrying: 0, failed: 1 })
  assertEquals([db.pdfs[0].attempts, db.pdfs[0].error, db.records[0].status, db.records[0].error], [1, missing, 'error', missing])
})

Deno.test('a closed record keeps its status when its PDF fails', async () => {
  const { db, deps } = await withJob('done')
  await renderPdfs(deps({ render: () => Promise.reject(new PdfProblem('This record or its report template no longer exists, so the PDF was not made.')) }))
  assertEquals([db.pdfs[0].status, db.records[0].status, db.events.at(-1)?.kind], ['failed', 'done', 'error'])
})

Deno.test('a job whose worker died is failed once its last lease ends, and only once', async () => {
  const { db, deps } = await withJob()
  Object.assign(db.pdfs[0], { attempts: 3, next_attempt_at: min(-1) })
  assertEquals((await renderPdfs(deps())).body, { done: 0, retrying: 0, failed: 1 })
  assertEquals((await renderPdfs(deps())).body, { done: 0, retrying: 0, failed: 0 })
  assertEquals([db.pdfs[0].status, db.events.filter((e) => e.kind === 'error').length], ['failed', 1])
})

Deno.test('two overlapping runs render a job once', async () => {
  const { uploads, deps } = await withJob()
  const [a, b] = await Promise.all([renderPdfs(deps()), renderPdfs(deps())])
  assertEquals([(a.body.done as number) + (b.body.done as number), uploads.length], [1, 1])
})

Deno.test('refuses a call without the cron secret', async () => {
  const { db, deps } = await withJob()
  assertEquals((await renderPdfs(deps({ authorised: false }))).status, 401)
  assertEquals(db.pdfs[0].status, 'queued')
})
