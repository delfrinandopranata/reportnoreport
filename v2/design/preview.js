// Preview behaviour only: mode switcher (URL + localStorage) and tiny demo interactions. The product's own behaviour lives in src/.
(() => {
  const H = document.documentElement
  const ACCENTS = ['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron']
  const q = new URLSearchParams(location.search)
  const get = (k, d) => { try { return q.get(k) || localStorage.getItem('rnr-pv-' + k) || d } catch { return q.get(k) || d } }
  const set = (k, v) => { try { localStorage.setItem('rnr-pv-' + k, v) } catch {} }
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const state = { theme: get('theme', 'light'), accent: get('accent', 'midnight'), density: get('density', 'comfortable'), motion: get('motion', 'full') }
  function apply() {
    H.dataset.theme = state.theme === 'system' ? (mq.matches ? 'dark' : 'light') : state.theme
    H.dataset.accent = ACCENTS.includes(state.accent) ? state.accent : 'midnight'
    H.dataset.density = state.density
    H.dataset.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'flat' : state.motion
    document.querySelectorAll('[data-pv]').forEach((el) => {
      const k = el.dataset.pv
      if (el.tagName === 'SELECT') el.value = state[k]
      else el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === state[k])))
    })
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pv] button')
    if (b) { const k = b.closest('[data-pv]').dataset.pv; state[k] = b.dataset.v; set(k, state[k]); apply() }
  })
  document.addEventListener('change', (e) => { const s = e.target.closest('select[data-pv]'); if (s) { state[s.dataset.pv] = s.value; set(s.dataset.pv, s.value); apply() } })
  mq.addEventListener('change', () => state.theme === 'system' && apply())
  apply()

  // generic demo hooks
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]')
    if (open) document.getElementById(open.dataset.open)?.showModal()
    const close = e.target.closest('[data-close]')
    if (close) close.closest('dialog')?.close()
    const tog = e.target.closest('[data-toggle]')
    if (tog) { const el = document.getElementById(tog.dataset.toggle); if (el) { el.hidden = !el.hidden; tog.setAttribute('aria-expanded', String(!el.hidden)) } }
    const tab = e.target.closest('[role="tab"]')
    if (tab) {
      const list = tab.closest('[role="tablist"]')
      list.querySelectorAll('[role="tab"]').forEach((t) => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1 })
      list.parentElement.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = p.id !== tab.getAttribute('aria-controls') })
    }
    const seg = e.target.closest('.rnr-seg[data-demo] > button')
    if (seg) seg.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === seg)))
    const sort = e.target.closest('.rnr-th-sort')
    if (sort) { const th = sort.closest('th'); const next = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending'; th.closest('tr').querySelectorAll('th').forEach((x) => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', next) }
    const step = e.target.closest('[data-step]')
    if (step) {
      const list = document.getElementById(step.dataset.target)
      if (list) {
        const items = [...list.children]; let i = items.findIndex((s) => s.getAttribute('aria-current') === 'step')
        const next = Math.max(0, Math.min(items.length - 1, i + (step.dataset.step === 'next' ? 1 : -1)))
        items.forEach((s, n) => { s.toggleAttribute('data-done', n < next); n === next ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current') })
      }
    }
    const busy = e.target.closest('[data-busy]')
    if (busy) { busy.setAttribute('aria-busy', 'true'); setTimeout(() => busy.setAttribute('aria-busy', 'false'), 1500) }
  })
  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('[role="tab"]')
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')]
      const n = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; n.focus(); n.click()
    }
  })
})()
