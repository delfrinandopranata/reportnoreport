import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CheckIcon } from '../../ui/icons'
import { useAction } from '../../ui/useAction'
import type { Uploader } from './FileInput'

type Props = { id: string; value: unknown; onChange(v: unknown): void; upload?: Uploader; describedBy?: string; invalid: boolean }
type Mode = 'draw' | 'type'
const W = 600
const H = 240

// The PNG is a document, so it is always black ink on a white page and reads the same in every theme.
const paintWhite = (c: HTMLCanvasElement) => {
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
}

async function typedPng(text: string): Promise<Blob | null> {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  paintWhite(c)
  const g = c.getContext('2d')!
  g.fillStyle = '#000'; g.textBaseline = 'middle'
  g.font = `italic 56px ${getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif'}`
  g.fillText(text, 24, H / 2, W - 48)
  return new Promise((ok) => c.toBlob(ok, 'image/png'))
}

export function SignaturePad({ id, value, onChange, upload, describedBy, invalid }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [mode, setMode] = useState<Mode>('draw')
  const [drawn, setDrawn] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useAction()
  const saved = typeof value === 'string'
  const hasInk = mode === 'draw' ? drawn : typed.trim() !== ''
  const setCanvas = useCallback((c: HTMLCanvasElement | null) => { ref.current = c; if (c) paintWhite(c) }, [])

  const pen = () => {
    const g = ref.current!.getContext('2d')!
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000'
    return g
  }
  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [(e.clientX - r.left) * (e.currentTarget.width / r.width), (e.clientY - r.top) * (e.currentTarget.height / r.height)] as const
  }
  const reset = () => {
    if (ref.current) paintWhite(ref.current)
    setDrawn(false); setTyped(''); setError(null); onChange(undefined)
  }
  const switchTo = (m: Mode) => { if (m !== mode) { setMode(m); reset() } }
  const roving = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    const m: Mode = mode === 'draw' ? 'type' : 'draw'
    switchTo(m)
    requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>(`[data-mode="${m}"]`)?.focus())
  }
  const store = () => save.run(async () => {
    setError(null)
    if (!upload) return
    if (!hasInk) { setError('Draw or type your signature first.'); return }
    const blob = mode === 'type' ? await typedPng(typed.trim()) : await new Promise<Blob | null>((ok) => ref.current!.toBlob(ok, 'image/png'))
    if (!blob) { setError('Your signature was not saved. Clear it and sign again.'); return }
    try { onChange(await upload(blob, 'signature.png')) } catch { setError('Your signature was not saved. Clear it and sign again.') }
  })

  return (
    <>
      <div className="rnr-seg" role="radiogroup" aria-labelledby={`${id}-l`} onKeyDown={roving}>
        {(['draw', 'type'] as const).map((m) => (
          <button key={m} type="button" role="radio" data-mode={m} aria-checked={mode === m} tabIndex={mode === m ? 0 : -1} onClick={() => switchTo(m)}>
            {m === 'draw' ? 'Draw' : 'Type'}
          </button>
        ))}
      </div>
      {mode === 'draw' ? (
        <canvas id={id} ref={setCanvas} width={W} height={H} tabIndex={-1} role="img" className="rnr-sign" aria-describedby={describedBy}
          aria-label="Signature pad. Draw with a mouse, pen or finger, or choose Type to sign with your name."
          onPointerDown={(e) => {
            if (saved) onChange(undefined) // the stored PNG would no longer match what is shown
            drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId)
            const g = pen(); g.beginPath(); g.moveTo(...at(e)); setDrawn(true)
          }}
          onPointerMove={(e) => { if (drawing.current) { const g = pen(); g.lineTo(...at(e)); g.stroke() } }}
          onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} />
      ) : (
        <input id={id} className="rnr-input" type="text" autoComplete="name" maxLength={80} placeholder="Type your full name" value={typed}
          aria-describedby={describedBy} aria-invalid={invalid || undefined}
          onChange={(e) => { setTyped(e.target.value); if (saved) onChange(undefined) }} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={save.busy} onClick={store}>
          {save.busy && <span className="rnr-spin" aria-hidden="true" />}{save.busy ? 'Saving signature…' : 'Save signature'}
        </button>
        <button type="button" className="rnr-btn rnr-btn-ghost" onClick={reset}>Clear</button>
        <span className="rnr-status" role="status">{saved && !save.busy && <><CheckIcon size={14} />Signature saved</>}</span>
      </div>
      {hasInk && !saved && !save.busy && upload && <p className="rnr-caption">Not saved yet. Select Save signature to keep it.</p>}
      {!upload && <p className="rnr-caption">Signatures are not saved in the preview.</p>}
      {error && <p className="rnr-error" role="alert">{error}</p>}
    </>
  )
}
