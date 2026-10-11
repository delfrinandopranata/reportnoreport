import type { ReactNode } from 'react'

/** The page header of design/components/PageHeader: micro crumb, one h1 (the last word of a multi-word title is the italic accent), lede, actions. */
export function PageHead({ id, title, crumb, lede, below, accent = true, align, className = '', titleClassName = '', children }: {
  id?: string; title: string; crumb?: string; lede?: ReactNode; below?: ReactNode; accent?: boolean; align?: 'center'; className?: string; titleClassName?: string; children?: ReactNode
}) {
  const at = title.lastIndexOf(' ')
  return (
    <header className={`rnr-page-head ${className}`.trim()} data-align={align}>
      <div>
        {crumb && <p className="rnr-micro">{crumb}</p>}
        <h1 id={id} className={`rnr-page-title ${titleClassName}`.trim()} tabIndex={-1}>{accent && at > 0 ? <>{title.slice(0, at)} <em>{title.slice(at + 1)}</em></> : title}</h1>
        {lede && <p className="rnr-lede">{lede}</p>}
        {below}
      </div>
      {children && <div className="rnr-page-actions">{children}</div>}
    </header>
  )
}
