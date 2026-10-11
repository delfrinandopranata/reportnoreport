export type DayPoint = { day: number; opens: number; clicks: number }
export type Point = { x: number; y: number; value: number }
const MIN_LEFT = 40 // four tabular digits
const GLYPH = 6.5 // average width of an 11px Inter digit
const RIGHT = 12
const TOP = 8
const AXIS = 24 // the day numerals under the plot
const WEEK = 7 * 24 * 60 * 60_000

const STEPS = [1, 2, 5]
/** About four whole-number steps from zero up to `max` (the report's niceTicks would give 0.25 of an open). */
export function countTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  let step = 1
  for (let mag = 1; ; mag *= 10) {
    const s = STEPS.map((m) => m * mag).find((v) => v >= raw)
    if (s) { step = s; break }
  }
  const out: number[] = []
  for (let v = 0; v < max + step; v += step) { out.push(v); if (v >= max) break }
  return out
}

/** Opens (series 1) and clicks (series 2) per day on one shared y scale that always starts at zero. */
export function dailyGeometry(days: DayPoint[], width: number, height: number) {
  const bottom = height - AXIS
  const values = countTicks(Math.max(0, ...days.flatMap((d) => [d.opens, d.clicks]))) // [0, 1] when everything is 0
  const hi = values[values.length - 1]
  const left = Math.max(MIN_LEFT, Math.ceil(Math.max(...values.map((v) => v.toLocaleString('en-GB').length)) * GLYPH + 12))
  const y = (v: number) => bottom - (v / hi) * (bottom - TOP)
  const step = days.length > 1 ? (width - left - RIGHT) / (days.length - 1) : 0
  const xs = days.map((_, i) => left + i * step)
  const series = (k: 'opens' | 'clicks'): Point[] => days.map((d, i) => ({ x: xs[i], y: y(d[k]), value: d[k] }))
  return { width, height, left, right: RIGHT, bottom, step, ticks: values.map((value) => ({ value, y: y(value) })), xs, opens: series('opens'), clicks: series('clicks') }
}

export const polyline = (p: Point[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')

const n = (v: number, one: string, many: string) => `${v.toLocaleString('en-GB')} ${v === 1 ? one : many}`
export function dailySummary(days: DayPoint[], inApp: boolean): string {
  const opens = days.reduce((a, d) => a + d.opens, 0)
  const clicks = days.reduce((a, d) => a + d.clicks, 0)
  const best = days.reduce((a, d) => (d.opens > a.opens ? d : a), days[0])
  if (inApp) return `Reads over the first 7 days: ${n(opens, 'read', 'reads')}, most on day ${best.day + 1}.`
  return `Opens and clicks over the first 7 days: ${n(opens, 'open', 'opens')} and ${n(clicks, 'click', 'clicks')}, most opens on day ${best.day + 1}.`
}

/** Shown instead of seven flat lines; "yet" while the first 7 days are still running. */
export function emptyChartText(inApp: boolean, startedAt: string | null, now: Date): string {
  const over = !!startedAt && now.getTime() - new Date(startedAt).getTime() > WEEK
  if (inApp) return over ? 'Nothing was read in the first 7 days.' : 'Nothing has been read yet.'
  return over ? 'Nothing was opened or clicked in the first 7 days.' : 'Nothing has been opened or clicked yet. Opens and clicks appear here as people read the email.'
}

/** A tooltip box of one 16px line per entry, clamped inside the plot. */
export function dayTipBox(lines: string[], anchorX: number, anchorY: number, width: number, height: number) {
  const w = Math.min(width, Math.ceil(Math.max(...lines.map((l) => l.length)) * GLYPH + 16))
  const h = 8 + 16 * lines.length + 8
  return { x: Math.max(0, Math.min(anchorX - w / 2, width - w)), y: Math.max(0, Math.min(anchorY - h - 8, height - h)), w, h }
}
