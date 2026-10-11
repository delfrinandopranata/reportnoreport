import { useRef, useState } from 'react'
import { ACCENTS, ACCENT_LABEL, DENSITIES, THEMES, type Appearance } from './appearance'
import { currentAppearance, saveAppearance } from './useAppearance'
import { useNotice } from './useNotice'
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, XIcon } from './icons'
import { FolderCard } from './FolderCard'
import { Stamp } from './Stamp'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Settings → Appearance. Every change applies at once (the page is the preview) and saves one at a time. Spec: design/components/AppearancePanel. */
export function AppearanceSettings() {
  const [a, setA] = useState<Appearance>(currentAppearance)
  const [notice, setNotice] = useNotice()
  const [error, setError] = useState<string | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())

  const change = (patch: Partial<Appearance>) => {
    const next = { ...a, ...patch }
    setA(next)
    setError(null)
    // A newer change while one is saving is queued behind it, so the account always ends on the last choice.
    chain.current = chain.current.then(async () => {
      const { error: e } = await saveAppearance(next)
      if (e) setError(e)
      else setNotice('Appearance saved.')
    })
  }
  const segment = (name: string, legend: string, values: readonly string[], current: string, key: 'theme' | 'density') => (
    <fieldset>
      <legend>{legend}</legend>
      <div className="rnr-seg" role="radiogroup" aria-label={legend}>
        {values.map((v) => (
          <label key={v} className="rnr-seg-i">
            <input type="radio" name={name} value={v} checked={current === v} onChange={() => change({ [key]: v })} />
            <span>{cap(v)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )

  return (
    <FolderCard tab="Settings · Appearance" headingId="appearance-h" className="rnr-folder--panel rnr-appearance">
      {segment('theme', 'Theme', THEMES, a.theme, 'theme')}
      <fieldset>
        <legend>Accent</legend>
        <div className="rnr-swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((id) => (
            <label key={id} className="rnr-swatch">
              <input type="radio" name="accent" value={id} checked={a.accent === id} aria-label={ACCENT_LABEL[id]} onChange={() => change({ accent: id })} />
              <span className="rnr-swatch-body">
                <span className="rnr-swatch-chip" data-accent={id} />
                {ACCENT_LABEL[id]}
                <span className="rnr-swatch-check"><CheckIcon size={12} /></span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {segment('density', 'Density', DENSITIES, a.density, 'density')}
      <div className="rnr-prefs-preview" aria-hidden="true">
        <span className="rnr-btn rnr-btn-primary">Start free <span className="rnr-btn-chip"><ArrowRightIcon size={16} /></span></span>
        <span className="rnr-trend" data-dir="up"><ArrowUpRightIcon size={14} />+12.4%</span>
        <Stamp label="Approved" />
      </div>
      <p className="rnr-caption mt-3">Your choice follows you to every device you sign in on.</p>
      <p className="rnr-caption" role="status">{notice}</p>
      {error && <p className="rnr-note" data-tone="down" role="alert"><XIcon size={20} /><span>{error}</span></p>}
    </FolderCard>
  )
}
