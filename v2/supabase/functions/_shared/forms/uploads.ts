import type { Answers, Field } from './types.ts'

const isObj = (v: unknown): v is Answers => !!v && typeof v === 'object' && !Array.isArray(v)

/** Shape and prefix are already checked by validateAnswers; this proves each referenced object was really uploaded (QA-P2-1). */
export async function missingUploads(fields: Field[], answers: Answers, fileExists: (path: string) => Promise<boolean>): Promise<Record<string, string>> {
  const jobs: Promise<[string, string] | null>[] = []
  const probe = (f: Field, v: unknown, key: string) => {
    if ((f.type !== 'file' && f.type !== 'signature') || typeof v !== 'string') return
    const msg = f.type === 'file' ? 'Upload the file again.' : 'Sign again.'
    jobs.push(fileExists(v).then((ok) => (ok ? null : [key, msg])))
  }
  for (const f of fields) {
    const v = answers[f.key]
    if (f.type === 'group' && Array.isArray(v)) {
      v.forEach((row, i) => { for (const c of f.fields ?? []) if (isObj(row)) probe(c, row[c.key], `${f.key}.${i}.${c.key}`) })
    } else probe(f, v, f.key)
  }
  return Object.fromEntries((await Promise.all(jobs)).filter((x): x is [string, string] => !!x))
}
