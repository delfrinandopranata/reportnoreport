import { LOOP_MS, loopState, runLine, shouldAnimate } from './loop'

const root = document.documentElement
const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)
const animate = shouldAnimate(matchMedia('(prefers-reduced-motion: reduce)').matches, location.search)

root.classList.add('js')
if (!animate) root.dataset.motion = 'flat'

/* Ticker: four rows from the start; one new row every 2.4 s while the hero is on screen. */
const NAMES = ['Aisha K.', 'Ben T.', 'Chen W.', 'Dana R.', 'Eli M.']
const runs = $<HTMLUListElement>('#runs')
let runNo = 4821
const addRun = (fresh: boolean) => {
  if (!runs) return
  const n = runNo++
  const li = document.createElement('li')
  li.textContent = runLine(n, NAMES[n % NAMES.length], 1 + ((n * 7) % 9))
  if (fresh) li.className = 'lp-new'
  runs.prepend(li)
  while (runs.children.length > 4) runs.lastElementChild?.remove()
}
for (let i = 0; i < 4; i++) addRun(false)

/* Reveals: one observer, each element once. Still mode shows everything at once. */
const reveal = document.querySelectorAll('.rnr-rise, .lp-sharp')
if (!animate) reveal.forEach((el) => el.classList.add('in'))
else {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
  }), { threshold: 0.25 })
  reveal.forEach((el) => io.observe(el))
}

if (animate) start()

function start() {
  const set = (el: Element, name: string, v: number) => el.setAttribute(name, String(v))
  const place = (el: SVGElement, path: SVGPathElement, len: number, u: number, o: number) => {
    if (o <= 0) { el.style.opacity = '0'; return }
    const p = path.getPointAtLength(u * len)
    set(el, 'cx', p.x); set(el, 'cy', p.y)
    el.style.opacity = String(o)
  }
  const len = (p: SVGPathElement) => p.getTotalLength()

  /* hero: pulse, two trail dots and a halo ride loopState; the stamp thumps at Ask HR */
  const hero = $('#hero')
  const paths = { p1: $<SVGPathElement>('#p1'), p2: $<SVGPathElement>('#p2'), p3: $<SVGPathElement>('#p3') }
  const dots: [SVGElement | null, number, number][] = [
    [$<SVGElement>('#pulse'), 0, 1], [$<SVGElement>('#halo'), 0, 0.5], [$<SVGElement>('#t1'), 0.07, 0.55], [$<SVGElement>('#t2'), 0.14, 0.3],
  ]
  const stamp = $('#stamp')
  const lens = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, p ? len(p) : 0]))
  let stampOn = false

  /* approvals: typing, press, stamp, on a 9 s loop */
  const appr = $('#appr')
  const typed = $('#typed')
  const full = typed?.textContent ?? ''
  const approve = $('#approve')
  const stamp2 = $('#stamp2')
  const APPR_MS = 9000
  let shown = -1, pressed = false, stamped = false

  /* hub: four dots travel the connectors, in and out alternately */
  const hub = $('#hub')
  const hubPaths = ['#h1', '#h2', '#h3', '#h4'].map((s) => $<SVGPathElement>(s))
  const hubDots = [...document.querySelectorAll<SVGElement>('.lp-hd')]
  const hubLens = hubPaths.map((p) => (p ? len(p) : 0))

  const targets = [hero, appr, hub]
  const seen = new Map<Element, { on: boolean; t0: number }>(targets.flatMap((t) => (t ? [[t, { on: false, t0: 0 }] as const] : [])))
  const vis = new IntersectionObserver((es) => es.forEach((e) => {
    const s = seen.get(e.target)
    if (s && s.on !== e.isIntersecting) { s.on = e.isIntersecting; if (s.on) s.t0 = performance.now() }
  }))
  targets.forEach((t) => t && vis.observe(t))

  let nextRun = performance.now() + 2400
  let raf = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const h = hero && seen.get(hero)
    if (h?.on) {
      const t = now - h.t0
      const st = loopState(t)
      // at rest the pulse parks on the branch it took, until the loop is about to restart
      const rest = st.path === null && t % LOOP_MS < 5200 ? (Math.floor(t / LOOP_MS) % 3 === 2 ? 'p3' : 'p2') : null
      dots.forEach(([el, delay, o]) => {
        if (!el) return
        const key = st.path ?? rest
        const p = key && paths[key]
        if (!key || !p) { el.style.opacity = '0'; return }
        if (st.path) place(el, p, lens[key], st.u - delay, st.u - delay >= 0 ? o : 0)
        else place(el, p, lens[key], 1, el === dots[0][0] || el === dots[1][0] ? o : 0)
      })
      if (st.stamp !== stampOn && stamp) {
        stampOn = st.stamp
        if (stampOn) stamp.setAttribute('data-thump', ''); else stamp.removeAttribute('data-thump')
      }
      if (now >= nextRun) { nextRun = now + 2400; addRun(true) }
    }
    const a = appr && seen.get(appr)
    if (a?.on && typed && approve && stamp2) {
      const u = (now - a.t0) % APPR_MS
      const k = Math.floor(Math.min(1, Math.max(0, (u - 600) / 2200)) * full.length)
      if (k !== shown) {
        shown = k
        typed.textContent = full.slice(0, k)
        if (k > 0 && k < full.length) typed.setAttribute('data-typing', ''); else typed.removeAttribute('data-typing')
      }
      const p = u > 3300 && u < 3700
      if (p !== pressed) { pressed = p; approve.toggleAttribute('data-press', p) }
      const s = u >= 3700 && u < 8000
      if (s !== stamped) { stamped = s; stamp2.toggleAttribute('data-thump', s) }
    }
    const hb = hub && seen.get(hub)
    if (hb?.on) {
      hubDots.forEach((el, i) => {
        const path = hubPaths[i]
        if (!path) return
        const raw = ((now - hb.t0 + i * 650) % 2600) / 2600
        const u = i % 2 ? 1 - raw : raw
        place(el, path, hubLens[i], u, Math.min(1, raw * 6, (1 - raw) * 6))
      })
    }
  }
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (!document.hidden) raf = requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', onVisibility)
  onVisibility()
}
