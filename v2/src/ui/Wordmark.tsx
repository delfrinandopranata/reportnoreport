const mark = (
  <>
    Report<span>No</span>
    <span className="rnr-wordmark-rr">
      R<svg className="rnr-strike" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20C8 14 14 8 22 3" /></svg>
    </span>
    eport
  </>
)

/** The name in Newsreader with the second R struck through (design/components/Wordmark). `lg` is the auth pages' size. */
export function Wordmark({ href, size = 'md' }: { href?: string; size?: 'md' | 'lg' }) {
  const cls = `rnr-wordmark${size === 'lg' ? ' text-[32px]' : ''}`
  return href
    ? <a href={href} className={cls} data-draw aria-label="ReportNoReport">{mark}</a>
    : <span className={cls} data-draw role="img" aria-label="ReportNoReport">{mark}</span>
}
