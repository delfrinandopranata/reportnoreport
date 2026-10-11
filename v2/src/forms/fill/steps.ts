import type { Field } from '../logic'

/** Each step is named by its page break's label; a page without one (the first never has one) is "Step N". */
export const stepLabels = (pages: Field[][]): string[] =>
  pages.map((page, i) => (page[0]?.type === 'page_break' && page[0].label?.trim()) || `Step ${i + 1}`)
