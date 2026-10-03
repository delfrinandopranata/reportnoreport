/** The header Stripe signs webhooks with (case-insensitive in HTTP). */
export const SIGNATURE_HEADER = 'stripe-signature'

export async function verify(signatureHeader: string, body: string, secret: string): Promise<boolean> {
  if (!signatureHeader) return false

  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=')
    const trimmedKey = key?.trim()
    const trimmedValue = value?.trim()
    if (trimmedKey && trimmedValue) {
      if (!acc[trimmedKey]) {
        acc[trimmedKey] = []
      }
      acc[trimmedKey].push(trimmedValue)
    }
    return acc
  }, {} as Record<string, string[]>)

  const timestamp = parts.t?.[0]
  const signatures = parts.v1 || []

  if (!timestamp || signatures.length === 0) return false

  // Check timestamp is within 300s tolerance
  const now = Math.floor(Date.now() / 1000)
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false

  const signedContent = `${timestamp}.${body}`
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(signedContent)

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const computedSignature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const computedHex = Array.from(new Uint8Array(computedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Check if any signature matches (constant-time comparison for each)
    for (const sig of signatures) {
      if (constantTimeCompare(computedHex, sig)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
