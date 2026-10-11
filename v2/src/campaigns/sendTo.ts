import { useMemo } from 'react'
import { useForms } from '../forms/api'
import type { Field } from '../forms/logic'
import { useReport } from '../reports/api'
import { dataColumns, stepFields } from '../reports/logic'
import { useOrg } from '../rbac/useOrg'
import { useWorkflow } from '../workflows/api'

export type SendToOption = { path: string; label: string }
/** Short-text answers of the report's workflow that may hold an address (decision 1); empty until a report is chosen. */
export function useSendToOptions(reportId: string) {
  const { orgId } = useOrg()
  const report = useReport(reportId)
  const wf = useWorkflow(report.data?.workflow_id ?? '')
  const forms = useForms(orgId)
  const options = useMemo<SendToOption[]>(() => (wf.data && forms.data
    ? dataColumns(stepFields(wf.data.graph, new Map(forms.data.map((f) => [f.id, f.schema as Field[]]))))
      .filter((col) => col.type === 'short_text' && /^[a-z][a-z0-9_]*$/.test(col.path)).map((col) => ({ path: col.path, label: col.label }))
    : []), [wf.data, forms.data])
  return { options, ready: !reportId || (!!wf.data && !!forms.data) }
}
