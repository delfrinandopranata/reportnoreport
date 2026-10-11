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
