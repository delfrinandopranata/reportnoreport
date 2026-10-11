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

  // Styles live in a stylesheet (not style attributes) so the banner looks the same on the public pages and in the app.
  const css = document.createElement('style')
  css.textContent =
    '.rnr-consent{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:50;max-width:40rem;margin:0 auto;display:flex;flex-direction:row;flex-wrap:wrap;gap:var(--space-3,12px);align-items:center;justify-content:space-between}' +
    '.rnr-consent-text{margin:0;flex:1 1 16rem}' +
    '.rnr-consent-text a{color:inherit;text-decoration:underline;text-underline-offset:2px}' +
    '.rnr-consent-actions{display:flex;gap:var(--space-2,8px)}' +
    '.rnr-consent .rnr-btn{min-height:44px}' +
    '@media (pointer:coarse){.rnr-consent-text a{display:inline-block;padding:12px 0;margin:-12px 0}}'
  const mount = () => { if (!css.isConnected) document.head.appendChild(css) }
  const hide = () => { bar?.remove(); bar = null }
  const show = () => {
    if (bar) return
    mount()
    bar = document.createElement('div')
    bar.className = 'rnr-card rnr-consent'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', 'Cookie choice')
    bar.innerHTML =
      '<p class="rnr-consent-text">This site uses cookies for analytics. Choose whether to allow them. <a href="/privacy">Read the privacy policy</a>.</p>' +
      '<div class="rnr-consent-actions"><button type="button" class="rnr-btn rnr-btn-secondary" data-choice="declined">Decline</button>' +
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
