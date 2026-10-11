import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import type { Answers, Field } from './logic'

export type FormRow = { id: string; name: string; schema: Field[]; updated_at: string }
export type LoadedForm = FormRow & { org_id: string }

export const useForms = (orgId: string | null) => useQuery({
  queryKey: ['forms', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data, error } = await supabase.from('forms').select('id, name, schema, updated_at').eq('org_id', orgId!).order('name')
    if (error) throw error
    return data as unknown as FormRow[]
  },
})

export const useForm = (id: string) => useQuery({
  queryKey: ['form', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('forms').select('id, org_id, name, schema, updated_at').eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as LoadedForm | null
  },
})

/** `id` is the submission, or the record for a workflow start; `status` / `recordError` come from `advance` only. */
export type SubmitResult =
  | { ok: true; id: string; status?: 'open' | 'done' | 'rejected' | 'error'; recordError?: string | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** submit-form writes its own user-facing sentences; anything else falls back to the generic one. */
export async function submitAnswers(formId: string, answers: Answers): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke('submit-form', { body: { formId, answers } })
  if (!error) return { ok: true, id: data.submissionId }
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (typeof body?.error === 'string') return { ok: false, error: body.error, fieldErrors: body.fieldErrors }
  }
  return { ok: false, error: 'We could not save your answers. Try again.' }
}
