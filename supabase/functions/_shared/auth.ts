import { env } from './env.ts'

interface SessionClaims {
  sub: string
  telegram_id: number
  exp: number
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(input.length + ((4 - (input.length % 4)) % 4), '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function hmacSha256Verify(key: string, message: string, signature: Uint8Array): Promise<boolean> {
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', cryptoKey, signature, new TextEncoder().encode(message))
}

/** Verifies the `authenticated` JWT minted by auth-telegram and returns its claims. */
export async function requireSession(req: Request): Promise<SessionClaims> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Missing or malformed session token')
  }

  const valid = await hmacSha256Verify(env.supabaseJwtSecret, `${encodedHeader}.${encodedPayload}`, base64UrlDecode(encodedSignature))
  if (!valid) throw new Error('Invalid session signature')

  const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as SessionClaims
  if (!claims.exp || claims.exp < Date.now() / 1000) throw new Error('Session expired')
  if (!env.allowedTelegramIds.includes(claims.telegram_id)) throw new Error('Telegram id no longer whitelisted')

  return claims
}
