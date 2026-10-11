import { useEffect, useId, useRef, useState } from 'react'
import type { RunResponse } from './api'
import { MIN_CHART_WIDTH, chartGeometry, chartHeight, chartPoints, labelStep, showLabel, tooltipBox } from './chart'
import { cellText, shownText } from './text'

const clip = (s: string, max = 12) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** One series in --in, drawn at the measured width so text stays 11px. Values are in the tooltip, the labels, the SVG title and the table; never colour alone (design/README dataviz). */
export function ChartWidget({ kind, title, data, reportId }: { kind: 'bar' | 'line'; title: string; data: RunResponse; reportId: string }) {
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [asTable, setAsTable] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (active === null) return
    const off = () => setActive(null)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') off() }
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) off() }
    addEventListener('keydown', key)
    addEventListener('pointerdown', down)
    addEventListener('scroll', off, true)
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', down); removeEventListener('scroll', off, true) }
  }, [active])

  const r = data.result
  const groups = r.kind === 'groups' && r.total > 0 ? r : null
  const { points, more } = groups ? chartPoints(groups.groups, data.aggregateFn === 'sum' ? 'sum' : 'count', groups.total) : { points: [], more: 0 }
  const narrow = width > 0 && width < MIN_CHART_WIDTH
  const table = asTable || narrow
  const valueOf = (p: { value: number; missing: boolean }) => (p.missing ? 'No numbers' : cellText(p.value))
  const summary = `${kind === 'bar' ? 'Bar' : 'Line'} chart of ${title}: ${points.map((p) => `${p.label} ${p.missing ? 'no numbers' : cellText(p.value)}`).join(', ')}.`

  let svg = null
  if (groups && !table && width > 0) {
    const h = chartHeight(width)
    const g = chartGeometry(points, width, h)
    const band = (width - g.left - g.right) / points.length
    const step = labelStep(band)
    const top = (b: (typeof g.bars)[number]) => (b.value >= 0 ? b.y : b.y + b.h)
    const tip = active !== null ? g.bars[active] : null
    // Sits above the bar's value label, so it does not hide the number it repeats.
    const box = tip ? tooltipBox([tip.label, valueOf(tip)], tip.cx, top(tip) - (band >= 36 && tip.value >= 0 ? 18 : 0), width, h) : null
    svg = (
      <svg className="rnr-chart" viewBox={`0 0 ${width} ${h}`} role="img" aria-labelledby={`${uid}-t`} data-kind={kind} data-hovering={active !== null || undefined}>
        <title id={`${uid}-t`}>{summary}</title>
        {g.ticks.map((t) => (
          <g key={t.value}>
            <line className="rnr-chart-grid" x1={g.left} x2={width - g.right} y1={t.y} y2={t.y} />
            <text className="rnr-chart-axis rnr-num" x={g.left - 6} y={t.y} textAnchor="end" dominantBaseline="middle">{cellText(t.value)}</text>
          </g>
        ))}
        <line className="rnr-chart-zero" x1={g.left} x2={width - g.right} y1={g.zeroY} y2={g.zeroY} />
        {kind === 'bar'
          ? g.bars.map((b, i) => <rect key={i} className="rnr-chart-bar" data-active={active === i || undefined} x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 1)} />)
          : (
            <>
              <path className="rnr-chart-line" d={g.line} />
              {g.bars.map((b, i) => <circle key={i} className="rnr-chart-dot" data-active={active === i || undefined} cx={b.cx} cy={top(b)} r={4} />)}
            </>
          )}
        {band >= 36 && g.bars.map((b, i) => (
          <text key={i} className="rnr-chart-value rnr-num" x={b.cx} y={b.value >= 0 ? top(b) - 6 : top(b) + 14} textAnchor="middle">{b.missing && band < 64 ? '0' : valueOf(b)}</text>
        ))}
        {g.bars.map((b, i) => showLabel(i, g.bars.length, step) && (
          <text key={i} className="rnr-chart-axis" x={b.cx} y={g.bottom + 16} textAnchor="middle">{clip(b.label, Math.min(12, Math.max(4, Math.floor(band / 6.5))))}</text>
        ))}
        {g.bars.map((_b, i) => (
          <rect key={i} className="rnr-chart-hit" x={g.left + i * band} y={0} width={band} height={h}
            onPointerEnter={() => setActive(i)} onPointerMove={() => setActive(i)} onClick={() => setActive(i)}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null) }} />
        ))}
        {tip && box && (
          <g className="rnr-chart-tip" aria-hidden="true">
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} />
            <text x={box.x + 8} y={box.y + 16}>{clip(tip.label)}</text>
            <text className="rnr-num" x={box.x + 8} y={box.y + 32}>{valueOf(tip)}</text>
          </g>
        )}
      </svg>
    )
  }
  return (
    <div ref={wrap} className="rnr-chart-wrap flex flex-col gap-2">
      {r.kind !== 'groups' && <p className="rnr-muted">This report is not grouped, so it cannot be drawn. Group it by a column, or show it as a number or a table.</p>}
      {r.kind === 'groups' && r.total === 0 && <p className="rnr-muted">No records to show yet.</p>}
      {groups && !narrow && (
        <button type="button" className="rnr-btn rnr-btn-ghost self-start" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>Show as table</button>
      )}
      {groups && narrow && <p className="rnr-caption">Too narrow for a chart, so this is shown as a table.</p>}
      {groups && table && (
        <table className="rnr-table rnr-table-bare">
          <caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col">{data.groupLabel}</th><th scope="col" className="num">{data.aggregateLabel}</th></tr></thead>
          <tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.label}</th><td className="num">{valueOf(p)}</td></tr>)}</tbody>
        </table>
      )}
      {svg}
      {groups && more > 0 && <p className="rnr-caption">{shownText(points.length, groups.total, 'group')}. <a className="underline" href={`#/reports/${reportId}`}>Open the report</a> to see them all.</p>}
      {points.some((p) => p.missing) && <p className="rnr-caption">Groups with no numbers show as 0.</p>}
    </div>
  )
}
