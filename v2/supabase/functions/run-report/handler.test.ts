import { assertEquals } from 'jsr:@std/assert@1'
import { runReportRequest, type Deps, type ReportSource, type SavedRow } from './handler.ts'
import { rec } from '../_shared/reports/fixture.ts'
import { FORM, ORG } from '../_shared/forms/fixture.ts'
import { LEAVE, WF, F_LEAVE, F_APPROVAL } from '../_shared/workflow/fixture.ts'
import type { ReportRecord } from '../_shared/reports/run.ts'

const REPORT = '0000000a-0000-0000-0000-00000000e001'
const SAVED: SavedRow = { name: 'Leave days by type', workflow_id: WF, columns: [{ meta: 'title' }, { field: 'leave_type' }, { field: 'days' }], filters: [], group_by: null, aggregate: null }

function source(records: ReportRecord[], over: Partial<ReportSource> = {}, pageSize = 1000): ReportSource & { pagesRead: number } {
  const s = {
    pagesRead: 0,
    permissions: () => Promise.resolve(new Set(['reports.view'])),
    savedReport: (id: string) => Promise.resolve(id === REPORT ? structuredClone(SAVED) : null),
    workflow: () => Promise.resolve({ name: 'Leave approval', graph: LEAVE }),
    forms: () => Promise.resolve(new Map([[F_LEAVE, FORM], [F_APPROVAL, [{ key: 'comment', type: 'long_text' as const, label: 'Comment' }]]])),
    names: () => Promise.resolve(new Map([['00000000-0000-0000-0000-0000000000a3', 'Ada Lovelace']])),
    async *records() {
      for (let i = 0; i < records.length; i += pageSize) { s.pagesRead += 1; yield records.slice(i, i + pageSize) }
    },
    ...over,
  }
  return s
}
const deps = (src: ReportSource, user: string | null = 'u'): Deps => ({ userId: () => Promise.resolve(user), source: src, now: () => new Date('2026-10-11T12:00:00Z') })
const many = (n: number) => Array.from({ length: n }, (_, i) => rec(`r${String(i).padStart(5, '0')}`, { leave_type: i % 2 ? 'Annual' : 'Medical', days: i },
  { created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }))

Deno.test('refuses a bad body, no session and a caller without reports.view', async () => {
  assertEquals((await runReportRequest({ orgId: 'x' }, deps(source([])))).status, 400)
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT, pageSize: 500 }, deps(source([])))).status, 400)
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(source([]), null))).status, 401)
  const none = source([], { permissions: () => Promise.resolve(new Set<string>()) })
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(none))), { status: 403, body: { error: 'Not allowed.' } })
})

Deno.test('a saved report runs newest first with labels and the full totals', async () => {
  const res = await runReportRequest({ orgId: ORG, reportId: REPORT, page: 2, pageSize: 2 }, deps(source(many(5))))
  assertEquals(res.status, 200)
  const body = (res as { body: Record<string, any> }).body
  assertEquals([body.name, body.workflowName, body.columns], ['Leave days by type', 'Leave approval', ['Title', 'Leave type', 'Days']])
  assertEquals([body.result.total, body.result.page, body.result.rows.map((r: { id: string }) => r.id)], [5, 2, ['r00002', 'r00001']])
})

Deno.test('a draft definition groups and sums with its labels', async () => {
  const res = await runReportRequest({ orgId: ORG, workflowId: WF, definition: { columns: [{ meta: 'title' }], group_by: { field: 'leave_type' }, aggregate: { fn: 'sum', field: 'days' } } },
    deps(source(many(4))))
  const body = (res as { body: Record<string, any> }).body
  assertEquals([body.groupLabel, body.aggregateLabel, body.result.groups.map((g: { key: string; sum: number }) => [g.key, g.sum])],
    ['Leave type', 'Total days', [['Annual', 4], ['Medical', 2]]])
})

Deno.test('a broken saved report is 409 with the reason, a missing one 404, a broken draft 400', async () => {
  const broken = source([], { savedReport: () => Promise.resolve({ ...SAVED, columns: [] }) })
  assertEquals(await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(broken)), { status: 409, body: { error: 'This report needs fixing: Choose at least one column.' } })
  assertEquals(await runReportRequest({ orgId: ORG, reportId: '0000000a-0000-0000-0000-00000000e0ff' }, deps(source([]))), { status: 404, body: { error: 'This report does not exist.' } })
  assertEquals(await runReportRequest({ orgId: ORG, workflowId: WF, definition: { columns: [] } }, deps(source([]))), { status: 400, body: { error: 'Choose at least one column.' } })
})

Deno.test('more than 10,000 records is refused, never cut', async () => {
  const src = source(many(10_001))
  const res = await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(src))
  assertEquals(res, { status: 413, body: { error: 'This workflow has more than 10,000 records you can see, which is more than one report can read. Ask an admin to split the work into separate workflows.' } })
  assertEquals(src.pagesRead, 11)
  assertEquals((await runReportRequest({ orgId: ORG, reportId: REPORT }, deps(source(many(10_000))))).status, 200)
})

Deno.test('csv export returns every row, not a page', async () => {
  const res = await runReportRequest({ orgId: ORG, reportId: REPORT, format: 'csv', page: 1, pageSize: 10 }, deps(source(many(120))))
  const out = res as { status: number; csv: string; filename: string }
  assertEquals([out.status, out.filename], [200, 'leave-days-by-type-2026-10-11.csv'])
  const lines = out.csv.split('\r\n')
  assertEquals([lines[0], lines.length], ['﻿Title,Leave type,Days', 122]) // header + 120 rows + the final empty string
})
