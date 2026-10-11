import { PROGRAMMES, ICON, stats, edgeKey, type Programme, type Step } from './programmes'
import { showState } from './loop'

const LANE_W = 84, COL_W = 128, ROW_H = 108, CARD_W = 98, CARD_H = 78, PAD_Y = 22, MID = 61, TAIL = 44
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

const pos = (st: Step) => ({ x: LANE_W + st.col * COL_W + (COL_W - CARD_W) / 2, y: st.lane * ROW_H + PAD_Y })

/** Path between two cards: straight or S-curve going forward, a vertical line within a column, a loop under the lanes going back. */
function route(a: Step, b: Step, lanes: number) {
  const pa = pos(a), pb = pos(b)
  if (b.col > a.col) {
    const x1 = pa.x + CARD_W, y1 = pa.y + MID, x2 = pb.x, y2 = pb.y + MID, dx = (x2 - x1) / 2
    return { d: `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 + 3, back: false }
  }
  if (b.col === a.col) {
    const up = b.lane < a.lane
    const x = pa.x + CARD_W / 2, y1 = up ? pa.y : pa.y + CARD_H, y2 = up ? pb.y + CARD_H : pb.y
    return { d: `M${x} ${y1}V${y2}`, lx: x, ly: (y1 + y2) / 2, back: false }
  }
  const x1 = pa.x + CARD_W / 2, x2 = pb.x + CARD_W / 2, base = lanes * ROW_H - 8
  const y1 = pa.y + CARD_H, y2 = pb.y + CARD_H, low = Math.max(y1, y2) + 26, floor = Math.min(low, base + 16)
  return { d: `M${x1} ${y1}C${x1} ${floor} ${x2} ${floor} ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: floor + 8, back: true }
}

type View = { p: Programme; cards: Map<string, HTMLElement>; items: Map<string, HTMLElement>; ticks: Map<string, HTMLElement>; paths: Map<string, SVGPathElement>; lens: Map<string, number>; pulse: SVGElement; halo: SVGElement; stage: HTMLElement; fit: HTMLElement; root: HTMLElement }

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
    const lane = h('div', 'sl-lane', name)
    lane.style.setProperty('--y', `${i * ROW_H}px`); lane.style.setProperty('--rh', `${ROW_H}px`)
    stage.append(lane)
  })
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, fill: 'none', class: 'sl-svg' })
  const paths = new Map<string, SVGPathElement>(), lens = new Map<string, number>()
  const labels = s('g')
  for (const [a, b, label] of p.edges) {
    const r = route(byId.get(a) as Step, byId.get(b) as Step, p.lanes.length)
    const path = s('path', { d: r.d, class: `lp-edge${r.back ? ' sl-back' : ''}` }) as SVGPathElement
    svg.append(path); paths.set(edgeKey(a, b), path)
    if (label) {
      const t = s('text', { x: r.lx, y: r.ly, class: 'sl-label', 'text-anchor': 'middle' })
      t.textContent = label
      labels.append(t)
    }
  }
  const halo = s('circle', { r: 13, class: 'rnr-halo sl-dot' }), pulse = s('circle', { r: 6, class: 'rnr-pulse sl-dot' })
  svg.append(halo, pulse)
  stage.append(svg)

  const cards = new Map<string, HTMLElement>(), ticks = new Map<string, HTMLElement>(), items = new Map<string, HTMLElement>()
  const list = h('ol', 'sl-list')
  for (const st of p.steps) {
    const c = h('div', 'rnr-folder rnr-folder--node sl-card')
    c.dataset.state = 'idle'
    const tab = h('span', 'rnr-folder-tab'); tab.append(icon(ICON[st.type]), st.type)
    const body = h('div', 'rnr-folder-body'); body.append(h('span', 'sl-title', st.title))
    if (st.timer) { const t = h('span', 'rnr-chip sl-tick', timerText(st)); t.dataset.tone = 'accent'; body.append(t); ticks.set(st.id, t) }
    c.append(tab, body)
    if (st.type === 'APPROVAL') c.append(h('span', 'rnr-stamp rnr-stamp--sm sl-stamp', 'APPROVED'))
    const { x, y } = pos(st)
    c.style.setProperty('--x', `${x}px`); c.style.setProperty('--y', `${y}px`)
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
  return { p, cards, items, ticks, paths, lens, pulse, halo, stage, fit, root }
}

export function initShowcase(animate: boolean) {
  const host = document.getElementById('showcase')
  const tablist = host?.querySelector<HTMLElement>('[role=tablist]')
  const body = host?.querySelector<HTMLElement>('.sl-body')
  const side = host?.querySelector<HTMLElement>('.sl-side')
  if (!host || !tablist || !body || !side) return null

  const views = new Map<string, View>()
  let cur: View | null = null, base = 0, rebase = true, shown = -1
  const lastTick = new Map<string, string>()

  const fitStage = () => {
    if (!cur) return
    const w = parseFloat(cur.stage.style.getPropertyValue('--w'))
    cur.fit.style.setProperty('--z', String(Math.min(1, cur.fit.clientWidth / w)))
  }
  new ResizeObserver(fitStage).observe(body)

  const setState = (v: View, visited: number) => {
    const seen = new Set(v.p.order.slice(0, visited)), now = v.p.order[visited - 1]
    for (const [id, el] of [...v.cards, ...v.items]) el.dataset.state = id === now ? 'now' : seen.has(id) ? 'done' : 'idle'
    for (const [id, el] of v.cards) { const stamp = el.querySelector('.sl-stamp'); if (stamp) stamp.toggleAttribute('data-thump', seen.has(id)) }
  }
  const finish = (v: View) => {
    for (const el of [...v.cards.values(), ...v.items.values()]) el.dataset.state = 'done'
    v.pulse.style.opacity = v.halo.style.opacity = '0'
  }

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
    fitStage()
    for (const [id, t] of v.ticks) t.textContent = timerText(p.steps.find((x) => x.id === id) as Step)
    if (animate) {
      for (const [k, path] of v.paths) v.lens.set(k, path.getTotalLength())
      shown = -1; rebase = true; lastTick.clear(); setState(v, 1)
    } else finish(v)
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
  select(PROGRAMMES[0].key)

  /** t = ms since the showcase came into view. */
  const update = (t: number) => {
    const v = cur
    if (!v) return
    if (rebase) { base = t; rebase = false }
    const o = v.p.order, st = showState(t - base, o.length)
    if (st.visited !== shown) { shown = st.visited; setState(v, shown) }
    const now = v.p.steps.find((x) => x.id === o[st.visited - 1]) as Step
    for (const [id, el] of v.ticks) {
      const step = v.p.steps.find((x) => x.id === id) as Step, n = (step.timer as NonNullable<Step['timer']>).n
      const text = now.id === id && st.slot < 1 && st.edge < 0 ? timerText(step, Math.min(n, Math.floor(st.slot * n) + 1)) : timerText(step)
      if (lastTick.get(id) !== text) { lastTick.set(id, text); el.textContent = text }
    }
    if (st.edge > 0) {
      const key = edgeKey(o[st.edge - 1], o[st.edge]), path = v.paths.get(key)
      if (path) {
        const pt = path.getPointAtLength(st.u * (v.lens.get(key) as number))
        for (const dot of [v.pulse, v.halo]) { dot.setAttribute('cx', String(pt.x)); dot.setAttribute('cy', String(pt.y)) }
        v.pulse.style.opacity = '1'; v.halo.style.opacity = '.5'
        return
      }
    }
    v.pulse.style.opacity = v.halo.style.opacity = '0'
  }
  return { root: host, update }
}
