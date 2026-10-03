/**
 * Minimal ZIP writer (store method, no compression) so attachment-bundle exports don't need a
 * dependency. Attachments are already-compressed images or PDFs, so deflating them again would
 * buy little; "store" also keeps this file small enough to hand-verify against the format spec
 * (PKWARE APPNOTE.TXT §4.3: local file header, central directory, end-of-central-directory).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS date/time packed format used throughout the ZIP spec. */
function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff])
const u32 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff])
const byteLength = (parts: Uint8Array[]) => parts.reduce((n, p) => n + p.length, 0)

export type ZipEntry = { name: string; data: Uint8Array }

export function createZip(files: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(new Date())
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = encoder.encode(f.name)
    const crc = crc32(f.data)
    const size = u32(f.data.length)
    const localHeader = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(time), u16(date), u32(crc), size, size, u16(name.length), u16(0)]
    local.push(...localHeader, name, f.data)
    central.push(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(time), u16(date), u32(crc), size, size,
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    )
    offset += byteLength(localHeader) + name.length + f.data.length
  }

  const centralSize = byteLength(central)
  const end = [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)]
  return new Blob([...local, ...central, ...end] as BlobPart[], { type: 'application/zip' })
}
