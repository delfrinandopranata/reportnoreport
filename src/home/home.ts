import '../index.css'
import { createClient } from '@supabase/supabase-js'

const CONTACT_EMAIL = 'hello@example.com'

/** Initialize year in footer. */
document.getElementById('year')!.textContent = new Date().getFullYear().toString()

/** Set contact link email. */
const contactLink = document.getElementById('contact-link') as HTMLAnchorElement
contactLink.href = `mailto:${CONTACT_EMAIL}`

/** Get Supabase env vars, skip RPC check if missing. */
function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/** Check if platform is accepting signups, switch CTAs to waitlist if not. */
async function initializeSignupFlow() {
  const env = getSupabaseEnv()
  if (!env) {
    // If env vars missing, keep CTAs as sign-up (fail open)
    setupSignupCtas()
    return
  }

  try {
    const client = createClient(env.url, env.anonKey)
    const { data, error } = await client.rpc('platform_status')
    if (error) throw error

    const status = data as { accepting_signups: boolean }
    if (status.accepting_signups) {
      setupSignupCtas()
    } else {
      setupWaitlistCtas()
      setupWaitlistForm(client as unknown as ReturnType<typeof createClient>)
    }
  } catch (err) {
    // Fail open: keep CTAs as sign-up if RPC fails
    console.error('Failed to check platform status:', err)
    setupSignupCtas()
  }
}

/** Set up primary CTAs to link to /app/#signup. */
function setupSignupCtas() {
  const ctaButtons = document.querySelectorAll(
    '#cta-primary, #cta-primary-hero, #cta-primary-pricing'
  )
  ctaButtons.forEach((btn) => {
    ;(btn as HTMLElement).onclick = () => {
      window.location.href = '/app/#signup'
    }
  })
}

/** Set up primary CTAs to open waitlist dialog. */
function setupWaitlistCtas() {
  const ctaButtons = document.querySelectorAll(
    '#cta-primary, #cta-primary-hero, #cta-primary-pricing'
  )
  const dialog = document.getElementById('waitlist-dialog') as HTMLDialogElement
  ctaButtons.forEach((btn) => {
    ;(btn as HTMLElement).onclick = () => {
      dialog.showModal()
    }
  })
}

/** Set up waitlist form submission. */
function setupWaitlistForm(client: ReturnType<typeof createClient>) {
  const form = document.getElementById('waitlist-form') as HTMLFormElement
  const dialog = document.getElementById('waitlist-dialog') as HTMLDialogElement
  const messageDiv = document.getElementById('waitlist-message')!
  const errorDiv = document.getElementById('waitlist-error')!

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    messageDiv.classList.add('hidden')
    errorDiv.classList.add('hidden')

    // Get email and firm name from inputs
    const inputs = form.querySelectorAll('input')
    const finalEmail = (inputs[0] as HTMLInputElement).value.trim()
    const finalFirmName = (inputs[1] as HTMLInputElement).value.trim()

    if (!finalEmail || !finalFirmName) {
      errorDiv.textContent = 'Please fill in all fields.'
      errorDiv.classList.remove('hidden')
      return
    }

    try {
      const { error } = await (client.rpc as any)(
        'join_waitlist',
        {
          p_email: finalEmail,
          p_firm_name: finalFirmName,
        }
      )
      if (error) throw error

      messageDiv.textContent = "Thanks! We'll be in touch when space opens up."
      messageDiv.classList.remove('hidden')
      form.reset()
      setTimeout(() => dialog.close(), 2000)
    } catch (err) {
      console.error('Failed to join waitlist:', err)
      errorDiv.textContent = 'Something went wrong. Please try again.'
      errorDiv.classList.remove('hidden')
    }
  })
}

/** Initialize on page load. */
initializeSignupFlow()
