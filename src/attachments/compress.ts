const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.8
const COMPRESSIBLE = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Downscales to at most 1920px on the longest side and re-encodes as JPEG at 80% quality, using
 * the Canvas API (native, no dependency). PDFs pass through unchanged — there is no reliable
 * native browser API to compress a PDF, and adding a dependency for one file type isn't worth it.
 */
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type)) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob || blob.size >= file.size) return file // re-encoding made it bigger: keep the original
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}
