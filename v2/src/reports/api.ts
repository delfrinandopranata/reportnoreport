import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import type { Json } from '../data/database.types'
import type { Rule } from '../forms/logic'
import { csvFilename, type Aggregate, type Column, type ReportTemplate, type RunResult } from './logic'

export type TemplateRow = ReportTemplate & { id: string; workflow_id: string; updated_at: string }
export const useReportTemplate = (workflowId: string) => useQuery({
  queryKey: ['report-template', workflowId],
  queryFn: async () => {
    const { data, error } = await supabase.from('report_templates').select('id, workflow_id, header, fields, signoff, updated_at')
      .eq('workflow_id', workflowId).maybeSingle()
    if (error) throw error
    return data as unknown as TemplateRow | null
  },
})
export const createReportTemplate = (orgId: string, workflowId: string, t: ReportTemplate) =>
  supabase.from('report_templates').insert({ org_id: orgId, workflow_id: workflowId, ...t }).select('id, updated_at').single()
/** Conditional on updated_at: zero rows back means someone else saved first. */
export const updateReportTemplate = (id: string, t: ReportTemplate, updatedAt: string) =>
  supabase.from('report_templates').update(t).eq('id', id).eq('updated_at', updatedAt).select('updated_at')

export type PdfRow = { id: string; status: 'queued' | 'done' | 'failed'; path: string | null; error: string | null; created_at: string; finished_at: string | null }
export const useRecordPdf = (recordId: string) => useQuery({
  queryKey: ['record-pdfs', recordId],
  queryFn: async () => {
    const { data, error } = await supabase.from('record_pdfs').select('id, status, path, error, created_at, finished_at')
      .eq('record_id', recordId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return data as PdfRow | null
  },
  refetchInterval: (q) => (q.state.data?.status === 'queued' ? 2000 : false), // a queued PDF is usually ready within seconds
})
/** A 5-minute signed link, refreshed before it runs out, so "Open PDF" is a real link and no popup blocker interferes.
 *  With a name the link downloads under that name instead of the object's id. */
export const usePdfUrl = (path: string | null, downloadName?: string) => useQuery({
  queryKey: ['pdf-url', path, downloadName ?? null],
  enabled: !!path,
  staleTime: 240_000,
  refetchInterval: 240_000,
  queryFn: async () => {
    const { data, error } = await supabase.storage.from('record-pdfs').createSignedUrl(path!, 300, downloadName ? { download: downloadName } : undefined)
    if (error) throw error
    return data.signedUrl
  },
})
export const requestPdf = (recordId: string) => supabase.rpc('request_record_pdf', { p_record: recordId })

export type SavedReport = {
  id: string; workflow_id: string; name: string; columns: Column[]; filters: Rule[]
  group_by: Column | null; aggregate: Aggregate | null; updated_at: string
}
export type ReportListRow = { id: string; name: string; group_by: Column | null; updated_at: string; workflow: { name: string } | null }
export const useReports = (orgId: string | null) => useQuery({
  queryKey: ['reports', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('saved_reports').select('id, name, group_by, updated_at, workflow:workflows(name)')
      .eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as unknown as ReportListRow[]
  },
})
export const useReport = (id: string) => useQuery({
  queryKey: ['report', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('saved_reports').select('id, workflow_id, name, columns, filters, group_by, aggregate, updated_at')
      .eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as SavedReport | null
  },
})
export const createReport = (orgId: string, workflowId: string, name: string) => supabase.from('saved_reports')
  .insert({ org_id: orgId, workflow_id: workflowId, name, columns: [{ meta: 'title' }, { meta: 'status' }, { meta: 'created_at' }] })
  .select('id').single()
export type ReportFields = Pick<SavedReport, 'name' | 'columns' | 'filters' | 'group_by' | 'aggregate'>
export const updateReport = (id: string, f: ReportFields, updatedAt: string) =>
  supabase.from('saved_reports').update({ ...f, filters: f.filters as unknown as NonNullable<Json> }).eq('id', id).eq('updated_at', updatedAt).select('updated_at')
export const deleteReport = (id: string) => supabase.from('saved_reports').delete().eq('id', id).select('id')

export type RunBody = { reportId: string } | { workflowId: string; definition: Pick<SavedReport, 'columns' | 'filters' | 'group_by' | 'aggregate'> }
export type RunResponse = {
  name: string; workflowName: string; columns: string[]
  groupLabel: string | null; aggregateLabel: string | null; aggregateFn: 'count' | 'sum' | null; result: RunResult
}
/** run-report writes its own sentences (403, 409, 413…); anything else reads as the fallback. */
export class ReportError extends Error {
  status: number | null // null: the network or something unexpected; a number: run-report's own refusal
  constructor(message: string, status: number | null) { super(message); this.status = status }
}
const RUN_FAILED = 'We could not run this report. Try again.'
/** The server's "Not allowed." says nothing to do, so each refusal gets a sentence a person can act on. */
async function reportError(error: unknown, mayManage: boolean): Promise<ReportError> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status
    const b = await error.context.json().catch(() => null)
    const server = typeof b?.error === 'string' ? b.error : null
    if (status === 401) return new ReportError('Sign in again to continue.', status)
    if (status === 403) return new ReportError('You do not have permission to view reports. Ask an admin to give you access.', status)
    if (status === 404) return new ReportError('This report does not exist. It may have been deleted.', status)
    if (status === 409 && server) return new ReportError(mayManage ? server : `${server} Ask a reports manager to fix it.`, status)
    if (server) return new ReportError(server, status)
  }
  return new ReportError(RUN_FAILED, null)
}
export const useRunReport = (orgId: string | null, userId: string, mayManage: boolean, body: RunBody | null, page: number, pageSize: number) => useQuery({
  queryKey: ['report-run', userId, orgId, body, page, pageSize],
  enabled: !!orgId && !!body,
  placeholderData: keepPreviousData, // paging keeps the old page on screen, marked busy, instead of flashing a skeleton
  retry: (n, e) => !(e instanceof ReportError && e.status !== null) && n < 2,
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke<RunResponse>('run-report', { body: { orgId, ...body, page, pageSize } })
    if (error) throw await reportError(error, mayManage)
    return data as RunResponse
  },
})
/** Every row (never a page). Response.text() drops the BOM, so it is put back for Excel. Resolves to the file name, or the reason it failed. */
export async function downloadCsv(orgId: string, mayManage: boolean, body: RunBody, name: string): Promise<{ filename: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke<string>('run-report', { body: { orgId, ...body, format: 'csv' } })
  if (error) return { error: (await reportError(error, mayManage)).message }
  const filename = csvFilename(name, new Date().toISOString().slice(0, 10))
  const href = URL.createObjectURL(new Blob(['\uFEFF', String(data).replace(/^\uFEFF/, '')], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href, download: filename }).click()
  setTimeout(() => URL.revokeObjectURL(href), 0)
  return { filename }
}

export type WidgetKind = 'number' | 'table' | 'bar' | 'line'
export type WidgetRow = { id: string; report_id: string; kind: WidgetKind; title: string; span: 1 | 2 | 4; position: number }
export type Dashboard = { rows: WidgetRow[]; version: number }
/** The version is read before the widgets: a change in between only makes a later save refuse, never overwrite. */
export async function readDashboard(orgId: string): Promise<Dashboard> {
  const v = await supabase.from('dashboard_versions').select('version').eq('org_id', orgId).maybeSingle()
  if (v.error) throw v.error
  const { data, error } = await supabase.from('dashboard_widgets').select('id, report_id, kind, title, span, position')
    .eq('org_id', orgId).order('position').order('created_at')
  if (error) throw error
  return { rows: data as WidgetRow[], version: v.data?.version ?? 0 }
}
export const useWidgets = (orgId: string | null) => useQuery({
  queryKey: ['widgets', orgId],
  enabled: !!orgId,
  queryFn: () => readDashboard(orgId!),
})
export const addWidget = (row: Omit<WidgetRow, 'id'> & { org_id: string }) => supabase.from('dashboard_widgets').insert(row).select('id').single()
export const removeWidget = (id: string) => supabase.from('dashboard_widgets').delete().eq('id', id).select('id')
export const saveLayout = (orgId: string, layout: { id: string; span: number }[], version: number) =>
  supabase.rpc('save_dashboard_layout', { p_org: orgId, p_layout: layout, p_version: version })
