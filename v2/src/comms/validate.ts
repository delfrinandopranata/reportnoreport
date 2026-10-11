import type { TemplateFields } from './api'

export const LIMITS = { name: 120, subject: 200, body: 10000 } as const
const BLANK = { name: 'Enter a name for this template.', subject: 'Enter a subject.', body: 'Write a message.' } as const
const LONG = {
  name: 'Shorten the name to 120 characters or fewer.',
  subject: 'Shorten the subject to 200 characters or fewer.',
  body: 'Shorten the message to 10,000 characters or fewer.',
} as const

export type TemplateErrors = Partial<Record<'name' | 'subject' | 'body', string>>

/** One sentence per bad field, in form order, each naming the field and the fix. */
export function validateTemplate(f: TemplateFields): TemplateErrors {
  const out: TemplateErrors = {}
  for (const k of ['name', 'subject', 'body'] as const) {
    const len = f[k].trim().length
    if (!len) out[k] = BLANK[k]
    else if (len > LIMITS[k]) out[k] = LONG[k]
  }
  return out
}
