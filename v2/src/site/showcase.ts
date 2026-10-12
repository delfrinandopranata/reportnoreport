import { PROGRAMMES, ICON, stats, edgeKey, type Programme, type Step } from './programmes'
import { showState } from './loop'
import { LANE_W, COL_W, ROW_H, TAIL, CARD_W, pos, cardH, route, pathD, placeLabels } from './layout'

const NS = 'http://www.w3.org/2000/svg'

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}
const s = (tag: string, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}
const icon = (id: string) => {
  const svg = s('svg', { class: 'sl-ico', viewBox: '0 0 256 256', 'aria-hidden': 'true' })
  const use = s('use'); use.setAttribute('href', `#${id}`); svg.append(use)
  return svg
}
const timerText = (st: Step, k?: number) => {
  const t = st.timer as NonNullable<Step['timer']>
  return k === undefined ? `${t.n} ${t.unit}s` : `${t.unit === 'day' ? 'Day' : 'Month'} ${k} of ${t.n}`
}

type View = {
  p: Programme; cards: Map<string, HTMLElement>; items: Map<string, HTMLElement>; ticks: Map<string, HTMLElement>; paths: Map<string, SVGPathElement>
  lens: Map<string, number>; dots: Map<string, SVGElement[]>; stage: HTMLElement; fit: HTMLElement; root: HTMLElement
  shown: number; lastTick: Map<string, string>
}

function build(p: Programme): View {
  const cols = Math.max(...p.steps.map((x) => x.col)) + 1
  const W = LANE_W + cols * COL_W, H = p.lanes.length * ROW_H + TAIL
  const byId = new Map(p.steps.map((x) => [x.id, x]))
  const root = h('div', 'sl-panel')
  root.id = `sl-panel-${p.key}`
  root.setAttribute('role', 'tabpanel')
  root.setAttribute('aria-labelledby', `sl-tab-${p.key}`)
  root.tabIndex = 0

  const fit = h('div', 'sl-fit')
  const stage = h('div', 'sl-stage')
  stage.setAttribute('aria-hidden', 'true')
  stage.style.setProperty('--w', `${W}px`); stage.style.setProperty('--h', `${H}px`)
  p.lanes.forEach((name, i) => {
    const lane = h('div', 'sl-lane')
    lane.append(h('span', 'sl-lane-name', name))
    lane.style.setProperty('--y', `${i * ROW_H}px`); lane.style.setProperty('--rh', `${ROW_H}px`)
    stage.append(lane)
  })
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, fill: 'none', class: 'sl-svg' })
  const paths = new Map<string, SVGPathElement>(), lens = new Map<string, number>()
  const labels = s('g')
  for (const [a, b] of p.edges) {
    const r = route(byId.get(a) as Step, byId.get(b) as Step, p.lanes.length, p.edges.find((e) => e[0] === a && e[1] === b)?.[2])
    const path = s('path', { d: pathD(r.p), class: `lp-edge${r.back ? ' sl-back' : ''}` }) as SVGPathElement
    svg.append(path); paths.set(edgeKey(a, b), path)
  }
  for (const r of placeLabels(p).entries()) {
    const label = p.edges[r[0]][2] as string, box = r[1]
    const t = s('text', { x: box.x + box.w / 2, y: box.y + box.h - 3, class: 'sl-label', 'text-anchor': 'middle' })
    t.textContent = label
    labels.append(t)
  }
  // one pulse per edge, so parallel paths can all move at once
  const dots = new Map<string, SVGElement[]>()
  for (const k of paths.keys()) {
    const pair = [s('circle', { r: 13, class: 'rnr-halo sl-dot' }), s('circle', { r: 6, class: 'rnr-pulse sl-dot' })]
    svg.append(...pair); dots.set(k, pair)
  }
  stage.append(svg)

  const cards = new Map<string, HTMLElement>(), ticks = new Map<string, HTMLElement>(), items = new Map<string, HTMLElement>()
  const list = h('ol', 'sl-list')
  for (const st of p.steps) {
    const c = h('div', 'rnr-folder rnr-folder--node sl-card')
    c.dataset.state = 'idle'
    c.dataset.type = st.type
    const tab = h('span', 'rnr-folder-tab'); tab.append(icon(ICON[st.type]), st.type)
    const body = h('div', 'rnr-folder-body'); body.append(h('span', 'sl-title', st.title))
    if (st.timer) { const t = h('span', 'rnr-chip sl-tick', timerText(st)); t.dataset.tone = 'accent'; body.append(t); ticks.set(st.id, t) }
    if (st.options) {
      c.classList.add('sl-card--opts')
      const ul = h('ul', 'sl-opts')
      for (const o of st.options) ul.append(h('li', 'sl-opt', o))
      body.append(ul)
    }
    c.append(tab, body)
    if (st.type === 'APPROVAL') c.append(h('span', 'rnr-stamp rnr-stamp--sm sl-stamp', 'APPROVED'))
    const { x, y } = pos(st)
    c.style.setProperty('--x', `${x}px`); c.style.setProperty('--y', `${y}px`); c.style.setProperty('--ch', `${cardH(st)}px`)
    stage.append(c); cards.set(st.id, c)

    const li = h('li', 'sl-item'); li.dataset.state = 'idle'
    const meta = h('p', 'sl-meta'); meta.append(h('span', 'sl-chip', p.lanes[st.lane]))
    const type = h('span', 'rnr-micro sl-type'); type.append(icon(ICON[st.type]), st.type); meta.append(type)
    li.append(meta, h('p', 'sl-title', st.title), h('p', 'sl-note', st.note))
    list.append(li); items.set(st.id, li)
  }
  const over = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sl-svg sl-over' })
  over.append(labels)
  stage.append(over)
  fit.append(stage)
  root.append(fit, list)
  return { p, cards, items, ticks, paths, lens, dots, stage, fit, root, shown: -1, lastTick: new Map() }
}

const setState = (v: View, visited: number) => {
  const seen = new Set(v.p.beats.slice(0, visited).flat()), now = new Set(v.p.beats[visited - 1])
  for (const [id, el] of [...v.cards, ...v.items]) el.dataset.state = now.has(id) ? 'now' : seen.has(id) ? 'done' : 'idle'
  for (const [id, el] of v.cards) { const stamp = el.querySelector('.sl-stamp'); if (stamp) stamp.toggleAttribute('data-thump', seen.has(id)) }
}

/** Still mode: everything lit, nothing moving. */
const finish = (v: View) => {
  for (const el of [...v.cards.values(), ...v.items.values()]) el.dataset.state = 'done'
  for (const pair of v.dots.values()) for (const d of pair) d.style.opacity = '0'
}

const restart = (v: View, animate: boolean) => {
  for (const [id, t] of v.ticks) t.textContent = timerText(v.p.steps.find((x) => x.id === id) as Step)
  if (!animate) return finish(v)
  for (const [k, path] of v.paths) v.lens.set(k, path.getTotalLength())
  v.shown = -1; v.lastTick.clear(); setState(v, 1)
}

/** t = ms since this flow came into view. Every edge from the cards of one beat to the next carries its own pulse. */
function play(v: View, t: number) {
  const b = v.p.beats, st = showState(t, b.length)
  if (st.visited !== v.shown) { v.shown = st.visited; setState(v, v.shown) }
  const now = new Set(b[st.visited - 1])
  for (const [id, el] of v.ticks) {
    const step = v.p.steps.find((x) => x.id === id) as Step, n = (step.timer as NonNullable<Step['timer']>).n
    const text = now.has(id) && st.slot < 1 && st.edge < 0 ? timerText(step, Math.min(n, Math.floor(st.slot * n) + 1)) : timerText(step)
    if (v.lastTick.get(id) !== text) { v.lastTick.set(id, text); el.textContent = text }
  }
  const moving = new Set<string>()
  if (st.edge > 0) for (const a of b[st.edge - 1]) for (const c of b[st.edge]) if (a !== c && v.paths.has(edgeKey(a, c))) moving.add(edgeKey(a, c))
  for (const [k, [halo, pulse]] of v.dots) {
    if (!moving.has(k)) { halo.style.opacity = pulse.style.opacity = '0'; continue }
    const pt = (v.paths.get(k) as SVGPathElement).getPointAtLength(st.u * (v.lens.get(k) as number))
    for (const d of [halo, pulse]) { d.setAttribute('cx', String(pt.x)); d.setAttribute('cy', String(pt.y)) }
    pulse.style.opacity = '1'; halo.style.opacity = '.5'
  }
}

/** Scale the stage to its box; below `min` it keeps that scale and the box scrolls sideways instead. */
const fitTo = (v: View, min: number, box: HTMLElement = v.fit) => {
  const w = parseFloat(v.stage.style.getPropertyValue('--w'))
  v.fit.style.setProperty('--z', String(Math.max(min, Math.min(1, box.clientWidth / w))))
}

/** The hero: the busiest programme, live, in a window narrower than the flow. The stage is scaled to the window's height
 *  and pans so the cards that are lit (or about to be) stay in view. */
export function initHero(animate: boolean) {
  const host = document.getElementById('hero-flow')
  if (!host) return null
  const p = PROGRAMMES.reduce((a, b) => (b.steps.length > a.steps.length ? b : a))
  const v = build(p)
  v.root.removeAttribute('role'); v.root.removeAttribute('tabindex')
  host.replaceChildren(v.root)
  const W = parseFloat(v.stage.style.getPropertyValue('--w')), H = parseFloat(v.stage.style.getPropertyValue('--h'))
  const byId = new Map(p.steps.map((x) => [x.id, x]))
  let z = 1, lastX = -1
  const fit = () => { z = host.clientHeight / H; v.fit.style.setProperty('--z', String(z)) }
  const pan = (ids: string[]) => {
    const cx = ids.reduce((sum, id) => sum + pos(byId.get(id) as Step).x + CARD_W / 2, 0) / ids.length
    const view = host.clientWidth / z
    const x = Math.round(Math.max(0, Math.min(W - view, cx - view * 0.4)))
    if (x !== lastX) { lastX = x; v.stage.style.translate = `${-x}px 0`; v.stage.style.setProperty('--px', `${x}px`) }
  }
  new ResizeObserver(fit).observe(host)
  fit(); restart(v, animate)
  return {
    root: host,
    update: (t: number) => {
      play(v, t)
      const st = showState(t, p.beats.length)
      pan(p.beats[st.edge > 0 ? st.edge : st.visited - 1])
    },
  }
}

export function initShowcase(animate: boolean) {
  const host = document.getElementById('showcase')
  const tablist = host?.querySelector<HTMLElement>('[role=tablist]')
  const body = host?.querySelector<HTMLElement>('.sl-body')
  const side = host?.querySelector<HTMLElement>('.sl-side')
  if (!host || !tablist || !body || !side) return null

  const views = new Map<string, View>()
  let cur: View | null = null, base = 0, rebase = true
  new ResizeObserver(() => cur && fitTo(cur, 0)).observe(body)

  const select = (key: string) => {
    const p = PROGRAMMES.find((x) => x.key === key) as Programme
    for (const tab of tablist.querySelectorAll<HTMLElement>('[role=tab]')) {
      const on = tab.dataset.key === key
      tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1
    }
    let v = views.get(key)
    if (!v) { v = build(p); views.set(key, v) }
    cur = v
    body.replaceChildren(v.root)
    side.replaceChildren(h('h3', 'lp-h3', p.name), h('p', 'rnr-muted', p.blurb), (() => {
      const ul = h('ul', 'sl-stats'); for (const x of stats(p)) ul.append(h('li', '', x)); return ul
    })())
    fitTo(v, 0)
    rebase = true
    restart(v, animate)
  }

  const tabs = [...tablist.querySelectorAll<HTMLElement>('[role=tab]')]
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.key as string))
    tab.addEventListener('keydown', (e) => {
      const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
      if (to < 0) return
      e.preventDefault(); tabs[to].focus(); select(tabs[to].dataset.key as string)
    })
  })
  select(tabs[0].dataset.key as string)

  const update = (t: number) => {
    if (!cur) return
    if (rebase) { base = t; rebase = false }
    play(cur, t - base)
  }
  return { root: host, update }
}
