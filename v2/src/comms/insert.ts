/** Puts a token at the caret (replacing any selection) and says where the caret goes next. */
export function insertToken(value: string, start: number | null, end: number | null, token: string): { value: string; caret: number } {
  const clamp = (n: number | null) => Math.min(Math.max(n ?? value.length, 0), value.length)
  const a = clamp(start)
  const b = clamp(end)
  const from = Math.min(a, b)
  return { value: value.slice(0, from) + token + value.slice(Math.max(a, b)), caret: from + token.length }
}
