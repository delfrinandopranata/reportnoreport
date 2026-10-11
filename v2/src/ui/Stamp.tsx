const CORNER = { 'top-right': ' rnr-stamp--corner', 'top-left': ' rnr-stamp--corner left-4 right-auto', inline: '' } as const

/** Decoration only: the status word and icon beside it carry the meaning. Never animates in the app. A corner stamp sits in the nearest folder. */
export function Stamp({ label, corner = 'inline' }: { label: string; corner?: keyof typeof CORNER }) {
  return <span className={`rnr-stamp${CORNER[corner]}`} aria-hidden="true">{label}</span>
}
