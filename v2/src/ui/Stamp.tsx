/** Decoration only: the status word and icon beside it carry the meaning. Never animates in the app. */
export function Stamp({ label }: { label: string }) {
  return <span className="rnr-stamp" aria-hidden="true">{label}</span>
}
