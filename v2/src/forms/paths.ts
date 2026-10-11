/** Storage RLS lets a user write only under <org>/<own user id>/; submit-form checks the same prefix. */
export function filePath(orgId: string, userId: string, fileName: string, id: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(-80) || 'file'
  return `${orgId}/${userId}/${id}-${safe}`
}

/** The name a person uploaded, recovered from a stored path (drops the folders and the 36-character id and dash). */
export const fileName = (path: string) => {
  const tail = path.split('/').pop() ?? path
  return tail.length > 37 && tail[36] === '-' ? tail.slice(37) : tail
}

/** DOM id for the control behind a validation key such as `contacts.0.phone`. */
export const inputId = (idPrefix: string, errorKey: string) => `${idPrefix}-${errorKey.replaceAll('.', '-')}`
