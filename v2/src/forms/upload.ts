import { supabase } from '../data/supabase'
import { filePath } from './paths'

export const FILE_BUCKET = 'form-files'
const MAX_BYTES = 10 * 1024 * 1024

// shortcut: files uploaded but never submitted stay in the bucket; add a cleanup job when storage cost matters.
export async function uploadFile(orgId: string, userId: string, file: Blob, fileName: string): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('too-large')
  const path = filePath(orgId, userId, fileName, crypto.randomUUID())
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  return path
}

export const uploadMessage = (e: unknown) =>
  (e as Error)?.message === 'too-large'
    ? 'Choose a file under 10 MB.'
    : 'That file did not upload. Check your connection and choose it again.'
