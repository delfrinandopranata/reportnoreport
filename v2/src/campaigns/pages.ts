const NIL = '00000000-0000-0000-0000-000000000000'
export const PAGE_ROWS = 1000 // PostgREST's max rows per request

/** Every row by keyset pages; 'changed' when the total differs from the count taken first, so a file is never silently short. */
export async function readAllPages<T extends { id: string }>(fetchPage: (after: string) => Promise<T[]>, expected: number): Promise<T[] | 'changed'> {
  const rows: T[] = []
  let after = NIL
  for (;;) {
    const page = await fetchPage(after)
    rows.push(...page)
    if (page.length < PAGE_ROWS) break
    after = page[page.length - 1].id
  }
  return rows.length === expected ? rows : 'changed'
}
