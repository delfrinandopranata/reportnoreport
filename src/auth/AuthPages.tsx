import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { btn, Field, Icon, input, Wordmark } from '../ui'
import { takeReturnTo } from './route'

type Mode = 'signin' | 'signup' | 'forgot' | 'set-password'
const modeFromHash = (): Mode => (location.hash.startsWith('#signup') ? 'signup' : location.hash.startsWith('#forgot') ? 'forgot' : location.hash.startsWith('#set-password') || location.hash.includes('type=invite') || location.hash.includes('type=recovery') ? 'set-password' : 'signin')

export function AuthPages({ forceSetPassword = false, onPasswordSet }: { forceSetPassword?: boolean; onPasswordSet?: () => void } = {}) {
  const [mode, setMode] = useState<Mode>(forceSetPassword ? 'set-password' : modeFromHash)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [platformStatus, setPlatformStatus] = useState<{ accepting_signups: boolean } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const firstErrorRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (forceSetPassword || mode !== 'signup') return
    supabase.rpc('platform_status').then(({ data, error: err }) => {
      if (err) console.error('platform_status failed', err)
      else setPlatformStatus(data as { accepting_signups: boolean } | null)
    })
  }, [mode, forceSetPassword])

  useEffect(() => {
    if (forceSetPassword) return
    const onHash = () => { setMode(modeFromHash()); setError(''); setNotice(''); firstErrorRef.current = null }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [forceSetPassword])

  const run = async (e: FormEvent<HTMLFormElement>, fn: (data: FormData) => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    firstErrorRef.current = null
    try { await fn(new FormData(e.currentTarget)) } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Try again.'
      setError(msg)
      // Focus on first form field to draw attention to errors
      const firstInput = formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
      if (firstInput) {
        firstInput.focus()
        firstErrorRef.current = firstInput as HTMLInputElement
      }
    } finally { setBusy(false) }
  }

  const signIn = (data: FormData) => supabase.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) })
    .then(({ error }) => { if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message); location.hash = takeReturnTo() })
  const signUp = async (data: FormData) => {
    const password = String(data.get('password'))
    if (password.length < 8) throw new Error('Use at least 8 characters.')
    if (password !== String(data.get('confirm'))) throw new Error('The passwords do not match.')
    const { error } = await supabase.auth.signUp({
      email: String(data.get('email')),
      password,
      options: {
        emailRedirectTo: `${location.origin}/app/`,
        data: { name: String(data.get('name')), firm_name: String(data.get('firm_name')), currency: String(data.get('currency')) },
      },
    })
    if (error) {
      if (error.message === 'User already registered') throw new Error('An account with that email already exists. Sign in instead.')
      throw error
    }
    setNotice(`Check your email — we've sent a link to ${String(data.get('email'))} to verify your address.`)
  }
  const joinWaitlist = async (data: FormData) => {
    const { error } = await supabase.rpc('join_waitlist', { p_email: String(data.get('email')), p_firm_name: String(data.get('firm_name')) })
    if (error) throw error
    setNotice("You're on the waitlist. We'll email you when a place opens.")
  }
  const forgot = (data: FormData) => supabase.auth.resetPasswordForEmail(String(data.get('email')), { redirectTo: `${location.origin}/app/?flow=set-password` })
    .then(({ error }) => { if (error) throw error; setNotice('If that email has an account, a reset link is on its way.') })
  const setPassword = async (data: FormData) => {
    const password = String(data.get('password'))
    if (password.length < 8) throw new Error('Use at least 8 characters.')
    if (password !== String(data.get('confirm'))) throw new Error('The passwords do not match.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    const url = new URL(location.href)
    url.searchParams.delete('flow')
    history.replaceState(null, '', url)
    onPasswordSet?.()
    location.hash = takeReturnTo()
  }

  const copy = {
    signin: { title: 'Sign in', help: 'Use the email and password for your firm account.', submit: 'Sign in' },
    signup: { title: 'Start your free trial', help: 'Create your firm and account to get started.', submit: 'Create account' },
    forgot: { title: 'Reset your password', help: 'Enter your email and we will send you a link to choose a new password.', submit: 'Send reset link' },
    'set-password': { title: 'Set your password', help: 'Choose a password to finish setting up your account.', submit: 'Save password' },
  }[mode]
  const errorId = error ? 'auth-error' : undefined
  const fieldError = { 'aria-invalid': error ? true : undefined, 'aria-describedby': errorId }

  const errorNote = error && (
    <div id="auth-error" className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>{error}</div></div>
  )
  const noticeNote = notice && (
    <div className="rnr-note" data-tone="ok" role="status"><Icon name="check" className="size-5" /><div>{notice}</div></div>
  )
  const submitButton = (label: string) => (
    <button className={`${btn.primary} w-full`} disabled={busy} aria-busy={busy}>
      <span className="rnr-spin" aria-hidden />
      {busy ? 'Please wait...' : label}
    </button>
  )

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Wordmark size="lg" /></div>
        <div className="rnr-paper p-6 pt-8">
          <h1 className="rnr-heading mb-2">{copy.title}</h1>
          <p className="mb-6 text-ink-2">{copy.help}</p>
          {mode === 'signup' && platformStatus && !platformStatus.accepting_signups ? (
            <form key={mode} ref={formRef} className="grid gap-4" noValidate onSubmit={(e) => run(e, joinWaitlist)}>
              <div className="rnr-note" data-tone="warn"><Icon name="alert" className="size-5" /><div>Early access is full. Join the waitlist to be notified when a place opens.</div></div>
              <Field label="Your email"><input name="email" type="email" autoComplete="email" inputMode="email" autoFocus required className={input} {...fieldError} /></Field>
              <Field label="Firm name"><input name="firm_name" type="text" autoComplete="organization" required className={input} {...fieldError} /></Field>
              {errorNote}
              {noticeNote}
              {submitButton('Join waitlist')}
              <p className="text-center text-sm"><a href="#signin" className="rnr-link">Already have an account? Sign in</a></p>
            </form>
          ) : (
            <form key={mode} ref={formRef} className="grid gap-4" noValidate onSubmit={(e) => run(e, mode === 'signin' ? signIn : mode === 'signup' ? signUp : mode === 'forgot' ? forgot : setPassword)}>
              {mode === 'signup' && <>
                <Field label="Firm name"><input name="firm_name" type="text" autoComplete="organization" autoFocus required className={input} {...fieldError} /></Field>
                <div className="rnr-field">
                  <label htmlFor="currency" className="rnr-label">Currency</label>
                  <div className="rnr-select">
                    <select id="currency" name="currency" defaultValue="MYR" required className={input}>
                      <option value="MYR">MYR (Malaysia)</option>
                      <option value="SGD">SGD (Singapore)</option>
                      <option value="USD">USD (United States)</option>
                    </select>
                  </div>
                  <p className="rnr-hint">Your firm's currency cannot be changed later.</p>
                </div>
                <Field label="Your name"><input name="name" type="text" autoComplete="name" required className={input} {...fieldError} /></Field>
              </>}
              {mode !== 'set-password' && <Field label="Email"><input name="email" type="email" autoComplete="email" inputMode="email" autoFocus={mode !== 'signup'} required className={input} {...(mode === 'forgot' ? fieldError : {})} /></Field>}
              {mode !== 'forgot' && <PasswordField label="Password" name="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} autoFocus={mode === 'set-password'} describedBy={mode === 'set-password' ? ['pw-rules', errorId].filter(Boolean).join(' ') : errorId} invalid={!!error} />}
              {(mode === 'signup' || mode === 'set-password') && <>
                <p id="pw-rules" className="rnr-hint">At least 8 characters. Use a password you do not use anywhere else.</p>
                <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" describedBy={errorId} invalid={!!error} />
              </>}
              {errorNote}
              {noticeNote}
              {submitButton(copy.submit)}
            </form>
          )}
          {!forceSetPassword && <p className="mt-4 text-center text-sm">
            {mode === 'signin' ? <a href="#forgot" className="rnr-link">Forgot password?</a> : mode === 'signup' ? <a href="#signin" className="rnr-link">Already have an account? Sign in</a> : <a href="#signin" className="rnr-link">Back to sign in</a>}
          </p>}
        </div>
      </div>
    </main>
  )
}

function PasswordField({ label, name, autoComplete, autoFocus, describedBy, invalid }: { label: string; name: string; autoComplete: string; autoFocus?: boolean; describedBy?: string; invalid: boolean }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="rnr-field">
      <label htmlFor={name} className="rnr-label">{label}</label>
      <div className="relative">
        <input id={name} name={name} type={shown ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} required aria-invalid={invalid || undefined} aria-describedby={describedBy} className={`${input} pr-20`} />
        <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} className="rnr-btn rnr-btn-ghost rnr-btn-sm absolute right-1 top-1/2 -translate-y-1/2">{shown ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  )
}
