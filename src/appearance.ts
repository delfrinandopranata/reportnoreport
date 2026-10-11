import type { Appearance } from '../v2/design/appearance.ts'
export * from '../v2/design/appearance.ts'
/** The user_preferences key that holds the person's Appearance. */
export const APPEARANCE_KEY = 'appearance'

export const SAVE_FAILED = 'Your appearance is saved on this device only. Try again to keep it on your other devices.'

/** Pure save step, injectable for tests: persists and maps any failure to the device-only sentence. */
export async function persistAppearance(write: (a: Appearance) => Promise<{ error: unknown }>, a: Appearance): Promise<string | null> {
  try {
    const { error } = await write(a)
    if (error) console.error('Appearance not saved', error)
    return error ? SAVE_FAILED : null
  } catch (error) {
    console.error('Appearance not saved', error)
    return SAVE_FAILED
  }
}
