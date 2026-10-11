// Landing page motion: scroll reveals, count-ups, cursor light, window tilt and a looping workflow run.
// Everything degrades to the final, static state when the visitor prefers reduced motion.
const body = document.body
body.classList.add('js')
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const fine = matchMedia('(pointer: fine)').matches

const fmt = new Intl.NumberFormat('en-GB')

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count ?? 0)
  const suffix = el.dataset.suffix ?? ''
  if (still) { el.textContent = fmt.format(target) + suffix; return }
  const start = performance.now()
  const dur = 1400
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur)
    const eased = 1 - Math.pow(1 - t, 4)
    el.textContent = fmt.format(Math.round(target * eased)) + suffix
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// Reveal on scroll, staggered among siblings; also triggers bars, meters and counters inside.
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue
    const el = e.target as HTMLElement
    el.classList.add('is-in')
    el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp)
    seen.unobserve(el)
  }
}, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' })

document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
  const group = Array.from(el.parentElement?.querySelectorAll(':scope > [data-reveal]') ?? [])
  el.style.setProperty('--d', `${Math.min(group.indexOf(el), 5) * 0.08}s`)
  seen.observe(el)
})

// Cursor light and window tilt.
const sky = document.querySelector<HTMLElement>('.lp-sky')
const stage = document.querySelector<HTMLElement>('[data-tilt]')
const win = stage?.querySelector<HTMLElement>('.lp-window')
if (!still && fine && sky) {
  let frame = 0
  let x = 0
  let y = 0
  addEventListener('pointermove', (ev) => {
    x = ev.clientX
    y = ev.clientY
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      sky.style.setProperty('--mx', `${x}px`)
      sky.style.setProperty('--my', `${y}px`)
      sky.style.setProperty('--mo', '1')
      if (win && stage && innerWidth > 960) {
        const r = stage.getBoundingClientRect()
        const px = (x - r.left) / r.width - 0.5
        const py = (y - r.top) / r.height - 0.5
        if (Math.abs(px) < 1 && Math.abs(py) < 1) {
          win.style.setProperty('--ry', `${(-10 + px * 12).toFixed(2)}deg`)
          win.style.setProperty('--rx', `${(6 - py * 8).toFixed(2)}deg`)
          win.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(0)}%`)
          win.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(0)}%`)
        } else {
          win.style.removeProperty('--ry')
          win.style.removeProperty('--rx')
        }
      }
    })
  }, { passive: true })
  document.addEventListener('pointerleave', () => sky.style.setProperty('--mo', '0'))
}

// Header ticker.
const ticker = document.querySelector<HTMLElement>('[data-ticker]')
const tickerLines = ['forms flowing', '3 approvals today', 'report ready', '14 forms in']

// A looping workflow run in the hero window.
const approval = document.querySelector<HTMLElement>('[data-approval]')
const approvalText = document.querySelector<HTMLElement>('[data-approval-text]')
const reportText = document.querySelector<HTMLElement>('[data-report-text]')
const reportNode = reportText?.closest<HTMLElement>('.lp-node')
const runs = document.querySelector<HTMLOListElement>('[data-runs]')
const people = [
  ['Mei Ling Goh', 'annual leave'], ['Arjun Pillai', 'training leave'], ['Siti Hajar', 'medical leave'],
  ['Marcus Lim', 'annual leave'], ['Nur Aina', 'compassionate leave'], ['Ravi Kumar', 'annual leave'],
]
let inCount = 12
let turn = 0

function addRun(name: string, kind: string, verdict: 'approved' | 'declined') {
  if (!runs) return
  const li = document.createElement('li')
  const t = new Date()
  const time = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
  for (const [text, v] of [[time, ''], [`${name} · ${kind}`, ''], [verdict, verdict]]) {
    const s = document.createElement('span')
    s.textContent = text
    if (v) s.dataset.v = v
    li.append(s)
  }
  runs.prepend(li)
  while (runs.children.length > 3) runs.lastElementChild?.remove()
}

function tick() {
  if (document.hidden) return
  const [name, kind] = people[turn % people.length]
  const verdict = turn % 4 === 2 ? 'declined' : 'approved'
  turn += 1
  if (ticker) ticker.textContent = tickerLines[turn % tickerLines.length]
  if (approvalText) approvalText.textContent = `reviewing · ${name.split(' ')[0]}`
  approval?.classList.add('is-pulse')
  setTimeout(() => {
    approval?.classList.remove('is-pulse')
    if (approvalText) approvalText.textContent = verdict === 'approved' ? 'approved · just now' : 'declined · staff notified'
    inCount = inCount >= 14 ? 9 : inCount + 1
    if (reportText) reportText.textContent = inCount === 14 ? 'ready · 14 of 14' : `${inCount} of 14 in`
    reportNode?.classList.toggle('is-active', inCount === 14)
    addRun(name, kind, verdict)
  }, 1200)
}

if (!still) setInterval(tick, 3200)

// Theme preview: swap the demo's data-theme with real design-system components.
const demo = document.querySelector<HTMLElement>('[data-demo]')
const modes = document.querySelectorAll<HTMLButtonElement>('[data-mode]')
modes.forEach((btn) => {
  btn.addEventListener('click', () => {
    modes.forEach((b) => b.setAttribute('aria-checked', String(b === btn)))
    if (demo && btn.dataset.mode) demo.dataset.theme = btn.dataset.mode
  })
  btn.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return
    const list = Array.from(modes)
    const next = list[(list.indexOf(btn) + (ev.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]
    next.focus()
    next.click()
  })
})
