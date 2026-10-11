import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { FALLBACK, friendlyError } from '../ui/errors'
import { Skeleton } from '../ui/Skeleton'
import { useNotice } from '../ui/useNotice'
import { setEmailPref, usePrefs } from './api'
import { KIND_LABELS, MUTABLE_KINDS, type MutableKind } from './logic'

const CAPTIONS: Record<MutableKind, string> = {
  task_assigned: 'A task is given to you, or to a role you hold.',
  task_overdue: 'A task you hold passes its due time.',
  record_approved: 'A workflow tells you a record was approved.',
  record_rejected: 'A workflow tells you a record was rejected.',
  custom: 'Any other message a workflow sends you.',
}
const SAVE_FAILED = 'We could not save that setting. Try again.'

export function SettingsPage() {
  const { userId } = useOrg()
  const prefs = usePrefs(userId)
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const chains = useRef(new Map<MutableKind, Promise<void>>())
  const key = ['notification-prefs', userId]
  const put = (type: MutableKind, on: boolean) => qc.setQueryData<Map<MutableKind, boolean>>(key, (m) => new Map(m).set(type, on))

  // Optimistic: flip now, roll back on failure. Two toggles of one type run in order; different types overlap.
  const toggle = (type: MutableKind, enabled: boolean) => {
    put(type, enabled)
    setError(null)
    const run = async () => {
      const { data, error: e } = await setEmailPref(userId, type, enabled)
      if (e || !data?.length) {
        put(type, !enabled)
        const m = e ? friendlyError(e) : SAVE_FAILED
        setError(m === FALLBACK ? SAVE_FAILED : m)
        return
      }
      setNotice(`${KIND_LABELS[type]} emails turned ${enabled ? 'on' : 'off'}.`)
    }
    chains.current.set(type, (chains.current.get(type) ?? Promise.resolve()).then(run))
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4" aria-labelledby="settings-h">
      <h1 className="page-title" id="settings-h" tabIndex={-1}>Settings</h1>
      <section className="rnr-card gap-4" aria-labelledby="email-h">
        <h2 id="email-h" className="dialog-title">Email notifications</h2>
        <p className="rnr-muted">
          In-app notifications always arrive in the bell and cannot be turned off. These settings only stop the email copy.
          They apply in every organisation you belong to. Invitations are always emailed.
        </p>
        {prefs.isPending && <Skeleton rows={MUTABLE_KINDS.map(() => ({ w: '220px' }))} />}
        {prefs.isError && (
          <div className="flex flex-col items-start gap-2">
            <p className="rnr-error" role="alert">We could not load your settings. Check your connection and try again.</p>
            <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void prefs.refetch()}>Try again</button>
          </div>
        )}
        {prefs.isSuccess && (
          <fieldset className="flex flex-col gap-3">
            <legend className="rnr-fieldset-label">Email me when</legend>
            {MUTABLE_KINDS.map((k) => (
              <div key={k} className="flex flex-col">
                <label className="rnr-check">
                  <input type="checkbox" checked={prefs.data.get(k) ?? true} aria-describedby={`pref-${k}`}
                    onChange={(e) => toggle(k, e.target.checked)} />
                  <span>{KIND_LABELS[k]}</span>
                </label>
                <p className="rnr-caption" id={`pref-${k}`} style={{ marginLeft: 'var(--space-6)' }}>{CAPTIONS[k]}</p>
              </div>
            ))}
          </fieldset>
        )}
        <p className="rnr-caption" role="status">{notice}</p>
        {error && <p className="rnr-error" role="alert">{error}</p>}
      </section>
    </section>
  )
}
