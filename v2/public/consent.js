// public/consent.js — plain script, shared by every page including /app
(() => {
  const KEY = 'rnr.consent'
  const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
  const write = (v) => { try { localStorage.setItem(KEY, v) } catch {} }
  const clear = () => { try { localStorage.removeItem(KEY) } catch {} }

  let loaded = false
  const loadAnalytics = () => {
    if (loaded) return
    loaded = true
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
    const s = document.createElement('script')
    s.src = '/_vercel/insights/script.js'
    s.defer = true
    document.head.appendChild(s)
  }

  let bar = null
  const hide = () => { bar?.remove(); bar = null }
  const show = () => {
    if (bar) return
    bar = document.createElement('div')
    bar.className = 'rnr-card'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', 'Cookie choice')
    bar.style.cssText = 'position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:50;max-width:40rem;margin:0 auto;display:flex;flex-direction:row;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between'
    bar.innerHTML =
      '<p class="body" style="margin:0;flex:1 1 16rem">We use anonymous, cookie-free analytics to see which pages help. <a href="/privacy" style="color:inherit;text-decoration:underline">Read the privacy policy</a>.</p>' +
      '<div style="display:flex;gap:.5rem"><button type="button" class="rnr-btn rnr-btn-secondary" data-choice="declined">Decline</button>' +
      '<button type="button" class="rnr-btn rnr-btn-primary" data-choice="accepted">Accept</button></div>'
    bar.addEventListener('click', (e) => {
      const choice = e.target.closest('[data-choice]')?.dataset.choice
      if (!choice) return
      write(choice)
      hide()
      if (choice === 'accepted') loadAnalytics()
    })
    document.body.appendChild(bar)
  }

  const start = () => {
    const choice = read()
    if (choice === 'accepted') loadAnalytics()
    else if (choice !== 'declined') show()
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-consent-settings]')) return
      clear()
      show()
    })
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start()
})()
