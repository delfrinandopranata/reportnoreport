import { campaignTiles as sharedTiles, type Stats, type Tile } from '../../supabase/functions/_shared/comms/campaign.ts'
export * from '../../supabase/functions/_shared/comms/campaign.ts'
// The same module runs inside send-campaigns; the server's plan and rendering are the ones that count.
// Display of shares is overridden here (QA-P6-4): a real share is never shown as 0% or, short of all, as 100%.

const LOW = 0.01 // markers: other values are whole tenths from 1% to 99%, so these cannot collide
const HIGH = 99.99
export const pct = (n: number, d: number): number | null => {
  if (d <= 0) return null
  if (n > 0 && n / d < 0.01) return LOW
  if (n < d && n / d > 0.99) return HIGH
  return Math.round((n / d) * 1000) / 10
}
export const pctText = (p: number | null) =>
  p === null ? 'No data yet' : p === LOW ? '<1%' : p === HIGH ? '>99%' : `${p.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`

export function campaignTiles(s: Stats, channel: 'email' | 'in_app'): Tile[] {
  const share: Record<string, string> = channel === 'in_app'
    ? { Read: pctText(pct(s.opened, s.recipients)) }
    : { Delivered: pctText(pct(s.delivered, s.recipients)), Opened: pctText(pct(s.opened, s.delivered)), Clicked: pctText(pct(s.clicked, s.delivered)) }
  return sharedTiles(s, channel).map((t) => (t.label in share ? { ...t, value: share[t.label] } : t))
}
