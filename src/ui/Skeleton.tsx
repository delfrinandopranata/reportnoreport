export function Skeleton({ rows }: { rows: { w: string; h?: number }[] }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading…</span>
      {rows.map((r, i) => <div key={i} className="rnr-skeleton" style={{ height: r.h ?? 20, width: r.w }} />)}
    </div>
  )
}
