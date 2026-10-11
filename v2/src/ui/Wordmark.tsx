export function Wordmark({ href }: { href?: string }) {
  const inner = (
    <>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-lg)', background: 'var(--brand-solid)', display: 'grid', placeItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-solid-ink)' }}>R</span>
      </div>
      <span className="wordmark" aria-hidden="true">Report<span style={{ color: 'var(--ink-faint)' }}>No</span>Report</span>
    </>
  )
  return href
    ? <a href={href} className="flex items-center gap-3" aria-label="ReportNoReport">{inner}</a>
    : <div className="flex items-center justify-center gap-3" role="img" aria-label="ReportNoReport">{inner}</div>
}
