import type { Group } from './logic.ts'
import { keyText, numText } from './text.ts'

export const MAX_BARS = 24 // more than this is unreadable in a widget; the widget says how many it left out
export const MIN_CHART_WIDTH = 240 // narrower than this the numbers are shown as a table instead
export type Point = { label: string; value: number; missing: boolean }
export type Bar = Point & { x: number; y: number; w: number; h: number; cx: number }
export type Geometry = {
  width: number; height: number; left: number; right: number; bottom: number
  ticks: { value: number; y: number }[]; zeroY: number; bars: Bar[]; line: string
}

const STEPS = [1, 2, 2.5, 5, 10]
const GLYPH = 6.5 // average width of an 11px Inter digit, enough to size margins without measuring text

/** About `count` round steps covering min..max and always zero, so bars start from a real baseline. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  if (lo === hi) return [0, 1]
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = STEPS.map((m) => m * mag).find((s) => s >= raw) as number
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) out.push(Number(v.toFixed(10)))
  return out
}

/** A group with no numbers draws as 0 and is flagged, so the caption can say so. */
export function chartPoints(groups: Group[], fn: 'count' | 'sum', total: number): { points: Point[]; more: number } {
  const points = groups.slice(0, MAX_BARS).map((g) => ({
    label: keyText(g.key), value: fn === 'sum' ? g.sum ?? 0 : g.count, missing: fn === 'sum' && g.sum === null,
  }))
  return { points, more: Math.max(0, total - points.length) }
}

export const chartHeight = (width: number) => (width < 320 ? 160 : 200)

export function chartGeometry(points: Point[], width: number, height: number): Geometry {
  const right = 8
  const top = 8
  const bottom = 28
  const ticks = niceTicks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)))
  const left = Math.max(48, Math.ceil(Math.max(...ticks.map((t) => numText(t).length)) * GLYPH + 12))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (height - top - bottom)
  const band = (width - left - right) / Math.max(points.length, 1)
  const zeroY = y(0)
  const bars = points.map((p, i) => {
    const vy = y(p.value)
    return { ...p, x: left + i * band + band * 0.15, w: band * 0.7, y: Math.min(zeroY, vy), h: Math.abs(zeroY - vy), cx: left + i * band + band / 2 }
  })
  const line = bars.map((b, i) => `${i ? 'L' : 'M'}${b.cx.toFixed(1)} ${y(b.value).toFixed(1)}`).join(' ')
  return { width, height, left, right, bottom: height - bottom, ticks: ticks.map((v) => ({ value: v, y: y(v) })), zeroY, bars, line }
}

/** Every k-th category label is drawn when bands are under 56px wide; the table and tooltip hold the rest. */
export const labelStep = (band: number) => Math.max(1, Math.ceil(56 / band))
export const showLabel = (i: number, count: number, step: number) => i % step === 0 || i === count - 1

/** A two-line tooltip box, clamped inside the plot. */
export function tooltipBox(lines: [string, string], anchorX: number, anchorY: number, width: number, height: number) {
  const w = Math.min(width, Math.ceil(Math.max(...lines.map((l) => l.length)) * GLYPH + 16))
  const h = 40
  return { x: Math.max(0, Math.min(anchorX - w / 2, width - w)), y: Math.max(0, Math.min(anchorY - h - 8, height - h)), w, h }
}
