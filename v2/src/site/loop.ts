export const LOOP_MS = 6200

export type LoopState = { path: 'p1' | 'p2' | 'p3' | null; u: number; stamp: boolean }

/** t ms after the hero started: the pulse runs to the condition (1 s), then to Ask HR or, every third loop, to Log (1.2 s);
 *  the stamp shows while the pulse rests at Ask HR, until 5.2 s into the loop. */
export function loopState(t: number): LoopState {
  const at = t % LOOP_MS
  const logLoop = Math.floor(t / LOOP_MS) % 3 === 2
  if (at < 1000) return { path: 'p1', u: at / 1000, stamp: false }
  if (at < 2200) return { path: logLoop ? 'p3' : 'p2', u: (at - 1000) / 1200, stamp: false }
  return { path: null, u: 0, stamp: !logLoop && at < 5200 }
}

export const runLine = (n: number, name: string, days: number) =>
  `#${n} ${name} · ${days} ${days === 1 ? 'day' : 'days'} · ${days > 5 ? 'asked HR' : 'logged'}`

export const shouldAnimate = (reduce: boolean, search: string) => !reduce && !/[?&]motion=off(&|$)/.test(search)

export const SLOT_MS = 900
export const HOLD_MS = 2800

export type ShowState = { visited: number; edge: number; u: number; slot: number }

/** A programme of `len` visits: each visit lights its card, the pulse leaves 300 ms later and takes 600 ms to the next
 *  card (edge = index of the visit it is travelling to, or -1). `slot` is the progress 0..1 through the current visit. */
export function showState(t: number, len: number): ShowState {
  const at = t % ((len - 1) * SLOT_MS + HOLD_MS)
  const j = Math.floor(at / SLOT_MS)
  if (j >= len - 1) return { visited: len, edge: -1, u: 0, slot: 1 }
  const within = at - j * SLOT_MS
  return { visited: j + 1, edge: within >= 300 ? j + 1 : -1, u: within >= 300 ? (within - 300) / 600 : 0, slot: within / SLOT_MS }
}
