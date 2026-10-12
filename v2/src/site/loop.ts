export const shouldAnimate = (reduce: boolean, search: string) => !reduce && !/[?&]motion=off(&|$)/.test(search)

export const SLOT_MS = 900
export const HOLD_MS = 2800

export type ShowState = { visited: number; edge: number; u: number; slot: number }

/** A programme of `len` visits: each visit lights its card, the pulse leaves `lead` ms later and travels for the rest of
 *  the slot to the next card (edge = index of the visit it is travelling to, or -1). `slot` is the progress 0..1 through
 *  the current visit. The hero passes a short lead so the pulse is almost always moving. */
export function showState(t: number, len: number, lead = 300): ShowState {
  const at = t % ((len - 1) * SLOT_MS + HOLD_MS)
  const j = Math.floor(at / SLOT_MS)
  if (j >= len - 1) return { visited: len, edge: -1, u: 0, slot: 1 }
  const within = at - j * SLOT_MS
  return { visited: j + 1, edge: within >= lead ? j + 1 : -1, u: within >= lead ? (within - lead) / (SLOT_MS - lead) : 0, slot: within / SLOT_MS }
}
