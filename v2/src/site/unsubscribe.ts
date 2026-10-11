import { copyFor, readReply, tokenFrom, unsubscribeUrl, type State } from './unsubscribeCopy'

const title = document.getElementById('unsub-title') as HTMLElement
const body = document.getElementById('unsub-body') as HTMLElement
const actions = document.getElementById('unsub-actions') as HTMLElement

/** The organisation name is untrusted text from the server: textContent only, never innerHTML. */
function show(state: State, moveFocus: boolean) {
  const c = copyFor(state)
  title.textContent = c.title
  body.textContent = c.body
  document.title = `${c.title} — ReportNoReport`
  actions.replaceChildren()
  if (c.action) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rnr-btn rnr-btn-primary'
    b.textContent = c.action
    b.addEventListener('click', () => void submit(b))
    actions.append(b)
  }
  if (moveFocus) title.focus() // the page changed under a screen reader: start at the new heading
}

async function call(method: 'GET' | 'POST', token: string): Promise<State> {
  const url = unsubscribeUrl(import.meta.env.VITE_SUPABASE_URL, token)
  if (!url) return { kind: 'error' }
  try {
    const res = await fetch(url, method === 'POST'
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) }
      : { method })
    return readReply(method, res.status, await res.json().catch(() => null))
  } catch {
    return { kind: 'error' }
  }
}

const token = tokenFrom(location.search)
let working = false
async function submit(button: HTMLButtonElement) {
  if (working || !token) return
  working = true
  button.setAttribute('aria-busy', 'true')
  button.textContent = 'Unsubscribing…'
  show(await call('POST', token), true)
  working = false
}

show({ kind: 'checking' }, false)
if (!token) show({ kind: 'invalid' }, false)
else void call('GET', token).then((s) => show(s, true))
