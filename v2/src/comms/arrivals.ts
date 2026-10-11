type Seen = { id: string; title: string; read_at: string | null }

/** First fetch seeds `seen` silently; afterwards an unread id not seen before is an arrival. Reads, deletes and other tabs add nothing. */
export function newArrivals<T extends Seen>(seen: ReadonlySet<string> | null, items: T[]): { seen: Set<string>; arrived: T[] } {
  const next = new Set([...(seen ?? []), ...items.map((x) => x.id)])
  return { seen: next, arrived: seen ? items.filter((x) => !seen.has(x.id) && !x.read_at) : [] }
}

export const announcement = (arrived: Seen[]): string | null =>
  arrived.length === 0 ? null : arrived.length === 1 ? `New notification: ${arrived[0].title}` : `${arrived.length} new notifications.`
