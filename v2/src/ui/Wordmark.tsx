const mark = (
  <>
    Report<span>No</span>
    <span className="rnr-wordmark-rr">
      R<svg className="rnr-strike" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20C8 14 14 8 22 3" /></svg>
    </span>
    eport
  </>
)

/** The name in Fraunces with the second R struck through (design/components/Wordmark). */
export function Wordmark({ href }: { href?: string }) {
  return href
    ? <a href={href} className="rnr-wordmark" data-draw aria-label="ReportNoReport">{mark}</a>
    : <span className="rnr-wordmark" data-draw role="img" aria-label="ReportNoReport">{mark}</span>
}
