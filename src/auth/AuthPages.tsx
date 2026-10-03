import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { btn, Field, Icon, input } from '../ui'
import { takeReturnTo } from './route'

type Mode = 'signin' | 'signup' | 'forgot' | 'set-password'
const modeFromHash = (): Mode => (location.hash.startsWith('#signup') ? 'signup' : location.hash.startsWith('#forgot') ? 'forgot' : location.hash.startsWith('#set-password') || location.hash.includes('type=invite') || location.hash.includes('type=recovery') ? 'set-password' : 'signin')

export function AuthPages({ forceSetPassword = false, onPasswordSet }: { forceSetPassword?: boolean; onPasswordSet?: () => void } = {}) {
  const [mode, setMode] = useState<Mode>(forceSetPassword ? 'set-password' : modeFromHash)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [platformStatus, setPlatformStatus] = useState<{ accepting_signups: boolean } | null>(null)

  useEffect(() => {
    if (forceSetPassword || mode !== 'signup') return
    supabase.rpc('platform_status').then(({ data, error: err }) => {
      if (err) console.error('platform_status failed', err)
      else setPlatformStatus(data as { accepting_signups: boolean } | null)
    })
  }, [mode, forceSetPassword])

  useEffect(() => {
    if (forceSetPassword) return
    const onHash = () => { setMode(modeFromHash()); setError(''); setNotice('') }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [forceSetPassword])

  const run = async (e: FormEvent<HTMLFormElement>, fn: (data: FormData) => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try { await fn(new FormData(e.currentTarget)) } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.') } finally { setBusy(false) }
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
    setNotice(`Check your email -- we sent a link to ${String(data.get('email'))} to verify your address.`)
  }
  const joinWaitlist = async (data: FormData) => {
    const { error } = await supabase.rpc('join_waitlist', { p_email: String(data.get('email')), p_firm_name: String(data.get('firm_name')) })
    if (error) throw error
    setNotice('You are on the list. We will email you when a place opens.')
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

  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><Icon name="wallet" className="size-5" /></span>
          <span className="text-sm leading-tight font-semibold">Platform<span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">Client accounts</span></span>
        </div>
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-1 text-xl font-semibold">{copy.title}</h1>
          <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">{copy.help}</p>
          {mode === 'signup' && platformStatus && !platformStatus.accepting_signups ? (
            <form key={mode} className="grid gap-4" noValidate onSubmit={(e) => run(e, joinWaitlist)}>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Early access is full. Join the waitlist to be notified when a place opens.</p>
              <Field label="Your email"><input name="email" type="email" autoComplete="email" inputMode="email" autoFocus required className={input} {...fieldError} /></Field>
              <Field label="Firm name"><input name="firm_name" type="text" autoComplete="organization" required className={input} {...fieldError} /></Field>
              {error && <p id="auth-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">{error}</p>}
              {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">{notice}</p>}
              <button className={`${btn.primary} ${focusRing} w-full py-2.5`} disabled={busy} aria-busy={busy}>
                {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
                {busy ? 'Please wait...' : 'Join waitlist'}
              </button>
              <p className="text-center text-sm"><a href="#signin" className={linkCls}>Already have an account? Sign in</a></p>
            </form>
          ) : (
            <form key={mode} className="grid gap-4" noValidate onSubmit={(e) => run(e, mode === 'signin' ? signIn : mode === 'signup' ? signUp : mode === 'forgot' ? forgot : setPassword)}>
              {mode === 'signup' && <>
                <Field label="Firm name"><input name="firm_name" type="text" autoComplete="organization" autoFocus required className={input} {...fieldError} /></Field>
                <Field label="Currency">
                  <select name="currency" defaultValue="MYR" required className={input}>
                    <option value="MYR">MYR (Malaysia)</option>
                    <option value="SGD">SGD (Singapore)</option>
                    <option value="USD">USD (United States)</option>
                  </select>
                </Field>
                <Field label="Your name"><input name="name" type="text" autoComplete="name" required className={input} {...fieldError} /></Field>
              </>}
              {mode !== 'set-password' && <Field label="Email"><input name="email" type="email" autoComplete={mode === 'signup' ? 'email' : 'email'} inputMode="email" autoFocus={mode !== 'signup'} required className={input} {...(mode === 'forgot' ? fieldError : {})} /></Field>}
              {mode !== 'forgot' && <PasswordField label="Password" name="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} autoFocus={mode === 'set-password'} describedBy={mode === 'set-password' ? ['pw-rules', errorId].filter(Boolean).join(' ') : errorId} invalid={!!error} />}
              {(mode === 'signup' || mode === 'set-password') && <>
                <p id="pw-rules" className="-mt-2 text-xs text-zinc-600 dark:text-zinc-400">At least 8 characters. Use a password you do not use anywhere else.</p>
                <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" describedBy={errorId} invalid={!!error} />
              </>}
              {error && <p id="auth-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">{error}</p>}
              {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">{notice}</p>}
              <button className={`${btn.primary} ${focusRing} w-full py-2.5`} disabled={busy} aria-busy={busy}>
                {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
                {busy ? 'Please wait...' : copy.submit}
              </button>
            </form>
          )}
          {!forceSetPassword && <p className="mt-4 text-center text-sm">
            {mode === 'signin' ? <a href="#forgot" className={linkCls}>Forgot password?</a> : mode === 'signup' ? <a href="#signin" className={linkCls}>Already have an account? Sign in</a> : <a href="#signin" className={linkCls}>Back to sign in</a>}
          </p>}
        </div>
      </div>
    </main>
  )
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-white'
const linkCls = `rounded text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white ${focusRing}`

function PasswordField({ label, name, autoComplete, autoFocus, describedBy, invalid }: { label: string; name: string; autoComplete: string; autoFocus?: boolean; describedBy?: string; invalid: boolean }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={name} className="font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <div className="relative">
        <input id={name} name={name} type={shown ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} required aria-invalid={invalid || undefined} aria-describedby={describedBy} className={`${input} pr-16`} />
        <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} className={`absolute inset-y-0 right-1 my-1 rounded-md px-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white ${focusRing}`}>{shown ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  )
}
