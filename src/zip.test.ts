import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createZip } from './zip.ts'

/** Reads back local file entries (name + stored bytes) to prove createZip's output round-trips. */
function readZip(buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const entries: { name: string; data: Uint8Array }[] = []
  let offset = 0
  while (offset + 4 <= buf.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(buf.subarray(nameStart, nameStart + nameLen))
    const dataStart = nameStart + nameLen + extraLen
    entries.push({ name, data: buf.subarray(dataStart, dataStart + size) })
    offset = dataStart + size
  }
  return entries
}

test('createZip round-trips file names and bytes', async () => {
  const files = [
    { name: 'client-ledger.csv', data: new TextEncoder().encode('Date,Client\n2026-01-01,Kopi Corner') },
    { name: 'attachments/receipt.pdf', data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]) },
  ]
  const buf = new Uint8Array(await createZip(files).arrayBuffer())
  assert.equal(buf[0], 0x50) // 'P'
  assert.equal(buf[1], 0x4b) // 'K'

  const entries = readZip(buf)
  assert.equal(entries.length, 2)
  assert.equal(entries[0].name, 'client-ledger.csv')
  assert.deepEqual([...entries[0].data], [...files[0].data])
  assert.equal(entries[1].name, 'attachments/receipt.pdf')
  assert.deepEqual([...entries[1].data], [...files[1].data])
})

test('createZip produces an empty-but-valid archive for no files', async () => {
  const buf = new Uint8Array(await createZip([]).arrayBuffer())
  assert.equal(readZip(buf).length, 0)
  assert.ok(buf.length > 0) // end-of-central-directory record is still written
})
