import { useRef, useState } from 'react'
import { CheckIcon } from '../../ui/icons'
import { useAction } from '../../ui/useAction'
import { fileName } from '../paths'
import { uploadMessage } from '../upload'

export type Uploader = (file: Blob, name: string) => Promise<string>
type Props = { id: string; value: unknown; onChange(v: unknown): void; upload?: Uploader; describedBy?: string; invalid: boolean }

export function FileInput({ id, value, onChange, upload, describedBy, invalid }: Props) {
  const action = useAction()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const pick = (file?: File) => {
    if (!file || !upload) return
    action.run(async () => {
      setError(null)
      try { onChange(await upload(file, file.name)); setName(file.name) } catch (e) { setError(uploadMessage(e)) }
    })
  }
  const clear = () => {
    onChange(undefined); setName(null)
    if (input.current) input.current.value = ''
    input.current?.focus()
  }
  const stored = typeof value === 'string' ? (name ?? fileName(value)) : null
  return (
    <>
      <input ref={input} id={id} type="file" className="rnr-input" aria-describedby={describedBy} aria-invalid={invalid || undefined}
        aria-busy={action.busy} onChange={(e) => pick(e.target.files?.[0])} />
      {!upload && <p className="rnr-caption">Uploads are turned off in the preview.</p>}
      {action.busy && <p className="rnr-status" role="status"><span className="rnr-spin" aria-hidden="true" />Uploading…</p>}
      {!action.busy && stored && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="rnr-status"><CheckIcon size={14} />{stored}</p>
          <button type="button" className="rnr-btn rnr-btn-ghost" aria-label={`Remove ${stored}`} onClick={clear}>Remove file</button>
        </div>
      )}
      {error && <p className="rnr-error" role="alert">{error}</p>}
    </>
  )
}
