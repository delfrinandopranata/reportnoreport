import type { RenderContext } from '../../supabase/functions/_shared/comms/render.ts'
import type { Answers } from '../../supabase/functions/_shared/forms/types.ts'

export type PreviewRecord = { id: string; title: string; data: Answers }

/** What the editor previews: a real record when chosen, you as the recipient and the step assignee. Display only; sends render on the server. */
export function previewContext(rec: PreviewRecord | null, who: { orgName: string; myName: string; appUrl: string }): RenderContext {
  return {
    record: { title: rec?.title ?? 'Example record', data: rec?.data ?? {} },
    step: { assignee: { name: who.myName } },
    link: { task: `${who.appUrl}#/inbox`, record: rec ? `${who.appUrl}#/records/${rec.id}` : `${who.appUrl}#/records`, invite: who.appUrl },
    org: { name: who.orgName },
    recipient: { name: who.myName },
  }
}
