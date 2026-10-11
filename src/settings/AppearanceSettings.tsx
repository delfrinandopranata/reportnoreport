import { useRef, useState } from 'react'
import { ACCENTS, ACCENT_LABEL, DENSITIES, THEMES, type Appearance } from '../appearance'
import { useSession } from '../data/session'
import { Icon } from '../ui'
import { useAppearance } from '../useAppearance'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Settings → Appearance: personal, applied at once and saved one change at a time. Spec: v2/design/components/AppearancePanel. */
export function AppearanceSettings() {
  return <AppearancePanel profileId={useSession().profile.id} />
}

/** Takes the profile id so the super-admin console, which has no firm session, can show it too. */
export function AppearancePanel({ profileId }: { profileId: string }) {
  const [a, save] = useAppearance(profileId)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const chain = useRef<Promise<void>>(Promise.resolve())

  const change = (patch: Partial<Appearance>) => {
    const next = { ...a, ...patch }
    setError(null)
    setSaved(false)
    // A newer change while one is saving is queued behind it, so the account always ends on the last choice.
    chain.current = chain.current.then(async () => {
      const message = await save(next)
      setError(message)
      setSaved(!message)
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
    <section className="rnr-folder rnr-folder--panel rnr-appearance" aria-labelledby="appearance-h">
      <span className="rnr-folder-tab" id="appearance-h">Settings · Appearance</span>
      <div className="rnr-folder-body">
        <div className="rnr-perf" aria-hidden="true" />
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
                  <span className="rnr-swatch-check"><Icon name="check" className="size-3" /></span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {segment('density', 'Density', DENSITIES, a.density, 'density')}
        <div className="rnr-prefs-preview" aria-hidden="true">
          <span className="rnr-amt-dir" data-dir="in"><Icon name="in" />Receipt</span>
          <span className="rnr-amt">MYR 12,480.00</span>
          <span className="rnr-stamp">Paid</span>
        </div>
        <p className="rnr-caption mt-3">Your choice follows you to every device you sign in on.</p>
        <p className="rnr-caption" role="status">{saved ? 'Appearance saved.' : ''}</p>
        {error && <p className="rnr-note" data-tone="warn" role="alert"><Icon name="alert" className="size-5" /><span>{error}</span></p>}
      </div>
    </section>
  )
}
