import type { Programme, Step } from './programmes'

/** An edge whose label is one of its source card's options leaves from that option's row, so it needs no label of its own. */
export const isPort = (st: Step, label?: string) => !!label && !!st.options?.includes(label)


export const LANE_W = 84, COL_W = 128, ROW_H = 108, CARD_W = 98, CARD_H = 78, PAD_Y = 22, MID = 61, TAIL = 44, OPT_H = 18, OPT_PAD = 6
export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export const pos = (st: Step): Pt => ({ x: LANE_W + st.col * COL_W + (COL_W - CARD_W) / 2, y: st.lane * ROW_H + PAD_Y })
/** Option rows sit at the bottom of the card (see .sl-opts in site.css), so a card grows by one row per option. */
export const cardH = (st: Step) => CARD_H + (st.options?.length ?? 0) * OPT_H
export const cardRect = (st: Step): Rect => ({ ...pos(st), w: CARD_W, h: cardH(st) })
/** Where an option's line leaves the card: the right edge, level with its row. */
export const portY = (st: Step, label: string) => {
  const opts = st.options as string[]
  return pos(st).y + cardH(st) - OPT_PAD - (opts.length - opts.indexOf(label)) * OPT_H + OPT_H / 2
}

/** A cubic Bezier between two cards: S-curve forward, vertical line within a column, a loop under the lanes going back. */
export function route(a: Step, b: Step, lanes: number, label?: string): { p: [Pt, Pt, Pt, Pt]; back: boolean } {
  const pa = pos(a), pb = pos(b)
  if (b.col > a.col) {
    const x1 = pa.x + CARD_W, y1 = isPort(a, label) ? portY(a, label as string) : pa.y + MID, x2 = pb.x, y2 = pb.y + MID, dx = (x2 - x1) / 2
    return { p: [{ x: x1, y: y1 }, { x: x1 + dx, y: y1 }, { x: x2 - dx, y: y2 }, { x: x2, y: y2 }], back: false }
  }
  if (b.col === a.col) {
    const up = b.lane < a.lane, x = pa.x + CARD_W / 2, y1 = up ? pa.y : pa.y + cardH(a), y2 = up ? pb.y + cardH(b) : pb.y
    return { p: [{ x, y: y1 }, { x, y: y1 + (y2 - y1) / 3 }, { x, y: y1 + (2 * (y2 - y1)) / 3 }, { x, y: y2 }], back: false }
  }
  const x1 = pa.x + CARD_W / 2, x2 = pb.x + CARD_W / 2, y1 = pa.y + cardH(a), y2 = pb.y + cardH(b)
  const floor = Math.min(Math.max(y1, y2) + 26, lanes * ROW_H + 8)
  return { p: [{ x: x1, y: y1 }, { x: x1, y: floor }, { x: x2, y: floor }, { x: x2, y: y2 }], back: true }
}

export const pathD = ([a, b, c, d]: [Pt, Pt, Pt, Pt]) => `M${a.x} ${a.y}C${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`
export const pointAt = ([a, b, c, d]: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const m = 1 - t
  return {
    x: m * m * m * a.x + 3 * m * m * t * b.x + 3 * m * t * t * c.x + t * t * t * d.x,
    y: m * m * m * a.y + 3 * m * m * t * b.y + 3 * m * t * t * c.y + t * t * t * d.y,
  }
}

/** Bounding box of the tilted APPROVED stamp that lands under an approval card (see .sl-stamp in site.css). */
export const stampRect = (st: Step): Rect => {
  const { x, y } = pos(st), cx = x + CARD_W + 6 - 43.5, cy = y + 80 + 11
  return { x: cx - 48, y: cy - 20, w: 96, h: 40 }
}

export const labelSize = (text: string) => ({ w: text.length * 6 + 10, h: 14 })
const hit = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

/** Edges that show their own label; an option's edge is labelled by its row inside the card. */
export const labelled = (p: Programme) => {
  const byId = new Map(p.steps.map((s) => [s.id, s]))
  return p.edges.flatMap(([a, , label], i) => (label && !isPort(byId.get(a) as Step, label) ? [i] : []))
}

/** Puts each edge label as close to its edge as it can go without touching a card or another label. */
export function placeLabels(p: Programme): Map<number, Rect> {
  const byId = new Map(p.steps.map((s) => [s.id, s]))
  const cards = [...p.steps.map(cardRect), ...p.steps.filter((s) => s.type === 'APPROVAL').map(stampRect)]
  const placed = new Map<number, Rect>()
  const cols = Math.max(...p.steps.map((s) => s.col)) + 1
  const W = LANE_W + cols * COL_W, H = p.lanes.length * ROW_H + TAIL
  for (const i of labelled(p)) {
    const [a, b, label] = p.edges[i] as [string, string, string]
    const { p: pts } = route(byId.get(a) as Step, byId.get(b) as Step, p.lanes.length, label)
    const { w, h } = labelSize(label)
    let best: { r: Rect; cost: number } | null = null
    for (let t = 0.05; t <= 0.951; t += 0.05) {
      const c = pointAt(pts, t)
      for (let dy = -40; dy <= 40; dy += 4) {
        const r = { x: c.x - w / 2, y: c.y + dy - h / 2, w, h }
        if (r.x < 0 || r.y < 0 || r.x + w > W || r.y + h > H) continue
        if (cards.some((k) => hit(r, k, 3)) || [...placed.values()].some((k) => hit(r, k, 3))) continue
        const cost = Math.abs(dy) + Math.abs(t - 0.5) * 10
        if (!best || cost < best.cost) best = { r, cost }
      }
    }
    if (best) placed.set(i, best.r)
  }
  return placed
}

/** Where the hero camera aims: the centre of the lit cards, gliding toward the next beat's cards as the pulse travels
 *  (u 0..1), placed `focus` of the way across a `view`-wide window and clamped to the stage. */
export function cameraTarget(from: number, to: number, u: number, view: number, stageW: number, focus: number): number {
  const cx = from + (to - from) * u
  return Math.max(0, Math.min(stageW - view, cx - view * focus))
}
/** Frame-rate independent ease toward the target: about 63% of the gap closes every `tau` ms. */
export const glide = (x: number, target: number, dt: number, tau = 450) => x + (target - x) * (1 - Math.exp(-dt / tau))
