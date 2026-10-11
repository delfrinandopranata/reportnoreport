/** The editor sets this after deleting a template; the list reads it on mount to focus its heading and say what happened. */
let pending: string | null = null
export const setListArrival = (text: string) => { pending = text }
export const peekListArrival = () => pending
export const clearListArrival = () => { pending = null }
