import { initHero, initShowcase } from './showcase'
import { shouldAnimate } from './loop'

const root = document.documentElement
const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)
const animate = shouldAnimate(matchMedia('(prefers-reduced-motion: reduce)').matches, location.search)

root.classList.add('js')
if (!animate) root.dataset.motion = 'flat'

const hero = initHero(animate)
const showcase = initShowcase(animate)

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
  const hubPaths = [...document.querySelectorAll<SVGPathElement>('#hub .lp-edge')]
  const hubDots = [...document.querySelectorAll<SVGElement>('.lp-hd')]
  const hubLens = hubPaths.map((p) => (p ? len(p) : 0))

  const targets: (Element | null | undefined)[] = [hero?.root, appr, hub, showcase?.root]
  const seen = new Map<Element, { on: boolean; t0: number }>(targets.flatMap((t) => (t ? [[t, { on: false, t0: 0 }] as const] : [])))
  const vis = new IntersectionObserver((es) => es.forEach((e) => {
    const s = seen.get(e.target)
    if (s && s.on !== e.isIntersecting) { s.on = e.isIntersecting; if (s.on) s.t0 = performance.now() }
  }))
  targets.forEach((t) => t && vis.observe(t))

  let raf = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const h = hero && seen.get(hero.root)
    if (hero && h?.on) hero.update(now - h.t0)
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
    const sc = showcase && seen.get(showcase.root)
    if (showcase && sc?.on) showcase.update(now - sc.t0)
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
