// The mark: two report lines crossed by one beam ("report, no report"). design/components/Wordmark.
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <span className="rnr-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.31) }} aria-hidden="true">
      <svg viewBox="3 3 14 14"><path className="rows" d="M5 7.5h8M5 11.5h5" /><path className="beam" d="M4.5 15.5 15.5 4.5" /></svg>
    </span>
  )
}

export function Wordmark({ href }: { href?: string }) {
  const inner = (
    <>
      <Mark />
      <span className="rnr-wordmark" aria-hidden="true">Report<span>No</span>Report</span>
    </>
  )
  return href
    ? <a href={href} className="flex items-center gap-2.5" aria-label="ReportNoReport">{inner}</a>
    : <div className="flex items-center justify-center gap-2.5" role="img" aria-label="ReportNoReport">{inner}</div>
}
