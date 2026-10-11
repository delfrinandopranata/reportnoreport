import { useEffect, useId, useRef, useState } from 'react'
import { MIN_CHART_WIDTH, chartHeight } from '../reports/chart'
import type { DayRow } from './api'
import { dailyGeometry, dailySummary, dayTipBox, emptyChartText, polyline } from './chart'

type Series = 'in' | 'out'
const WORD: Record<Series, string> = { in: 'Opens', out: 'Clicks' }
const num = (n: number) => n.toLocaleString('en-GB')

/** Opens in --series-1 with circles and a solid line, clicks in --series-2 with squares and a dashed line: never colour alone (design/README dataviz). In-app shows one series, Reads. */
export function CampaignChart({ days, inApp, startedAt }: { days: DayRow[]; inApp: boolean; startedAt: string | null }) {
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<Series | null>(null)
  const [tip, setTip] = useState<number | null>(null)
  const [now] = useState(() => new Date())
  const empty = days.every((d) => !d.opens && !d.clicks)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [empty])
  useEffect(() => {
    if (tip === null) return
    const off = () => setTip(null)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') off() }
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) off() }
    addEventListener('keydown', key)
    addEventListener('pointerdown', down)
    addEventListener('scroll', off, true)
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', down); removeEventListener('scroll', off, true) }
  }, [tip])

  if (empty) return <p className="rnr-muted">{emptyChartText(inApp, startedAt, now)}</p>

  const series: Series[] = inApp ? ['in'] : ['in', 'out']
  const word = (s: Series) => (inApp ? 'Reads' : WORD[s])
  const narrow = width > 0 && width < MIN_CHART_WIDTH
  const table = asTable || narrow
  const summary = dailySummary(days, inApp)
  const g = width > 0 ? dailyGeometry(days, width, chartHeight(width)) : null
  const box = g && tip !== null
    ? dayTipBox([`Day ${days[tip].day + 1}`, ...(inApp ? [`Reads ${num(days[tip].opens)}`] : [`Opens ${num(days[tip].opens)}`, `Clicks ${num(days[tip].clicks)}`])],
      g.xs[tip], Math.min(g.opens[tip].y, g.clicks[tip].y), g.width, g.height)
    : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ul className="rnr-chart-legend" aria-label="Series">
          {series.map((s) => (
            <li key={s} onPointerEnter={() => setHover(s)} onPointerLeave={() => setHover(null)}>
              <svg width="24" height="12" aria-hidden="true">
                <line className="rnr-chart-line" data-series={s} x1="0" x2="24" y1="6" y2="6" />
                {s === 'in' ? <circle className="rnr-chart-dot" data-series="in" cx="12" cy="6" r="4" /> : <rect className="rnr-chart-mark" data-series="out" x="8" y="2" width="8" height="8" />}
              </svg>{word(s)}
            </li>
          ))}
        </ul>
        {!narrow && <button type="button" className="rnr-btn rnr-btn-ghost ml-auto" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>Show as table</button>}
      </div>
      {narrow && <p className="rnr-caption">Too narrow for a chart, so this is shown as a table.</p>}
      <div ref={wrap} className="rnr-chart-wrap">
        {table && (
          <table className="rnr-table rnr-table-bare">
            <caption className="sr-only">{summary}</caption>
            <thead><tr><th scope="col">Day</th><th scope="col" className="num">{inApp ? 'Reads' : 'Opens'}</th>{!inApp && <th scope="col" className="num">Clicks</th>}</tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}><th scope="row">Day {d.day + 1}</th><td className="num">{num(d.opens)}</td>{!inApp && <td className="num">{num(d.clicks)}</td>}</tr>
              ))}
            </tbody>
          </table>
        )}
        {!table && g && (
          <svg className="rnr-chart" viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-labelledby={`${uid}-t`} data-active={hover ?? undefined}>
            <title id={`${uid}-t`}>{summary}</title>
            {g.ticks.map((t) => (
              <g key={t.value}>
                <line className={t.value === 0 ? 'rnr-chart-zero' : 'rnr-chart-grid'} x1={g.left} x2={g.width - g.right} y1={t.y} y2={t.y} />
                <text className="rnr-chart-axis rnr-num" x={g.left - 6} y={t.y} textAnchor="end" dominantBaseline="middle">{num(t.value)}</text>
              </g>
            ))}
            {g.xs.map((x, i) => <text key={i} className="rnr-chart-axis rnr-num" x={x} y={g.height - 6} textAnchor="middle">{days[i].day + 1}</text>)}
            <polyline className="rnr-chart-line" data-series="in" points={polyline(g.opens)} onPointerEnter={() => setHover('in')} onPointerLeave={() => setHover(null)} />
            {!inApp && <polyline className="rnr-chart-line" data-series="out" points={polyline(g.clicks)} onPointerEnter={() => setHover('out')} onPointerLeave={() => setHover(null)} />}
            {g.opens.map((p, i) => <circle key={`o${i}`} className="rnr-chart-dot" data-series="in" data-active={tip === i || undefined} cx={p.x} cy={p.y} r={4} />)}
            {!inApp && g.clicks.map((p, i) => <rect key={`c${i}`} className="rnr-chart-mark" data-series="out" data-active={tip === i || undefined} x={p.x - 4} y={p.y - 4} width={8} height={8} />)}
            {g.xs.map((x, i) => (
              <rect key={i} className="rnr-chart-hit" x={x - g.step / 2} y={0} width={g.step} height={g.bottom}
                onPointerEnter={() => setTip(i)} onPointerMove={() => setTip(i)} onClick={() => setTip(i)}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip(null) }} />
            ))}
            {box && tip !== null && (
              <g className="rnr-chart-tip" aria-hidden="true">
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} />
                <text x={box.x + 8} y={box.y + 20}>Day {days[tip].day + 1}</text>
                <text className="rnr-num" x={box.x + 8} y={box.y + 36}>{inApp ? `Reads ${num(days[tip].opens)}` : `Opens ${num(days[tip].opens)}`}</text>
                {!inApp && <text className="rnr-num" x={box.x + 8} y={box.y + 52}>Clicks {num(days[tip].clicks)}</text>}
              </g>
            )}
          </svg>
        )}
      </div>
      <p className="rnr-caption">Day 1 is the first 24 hours after sending started.</p>
    </div>
  )
}
