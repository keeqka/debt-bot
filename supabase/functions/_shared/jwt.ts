/**
 * Minimal HS256 JWT signer, dependency-free (Web Crypto only). Used to mint
 * a Supabase-compatible access token after Telegram initData is verified
 * (ТЗ §2 step 4) — signed with the project's JWT secret so PostgREST/RLS
 * accept it as a normal `authenticated` session.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSha256Sign(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return new Uint8Array(signature)
}

export interface SupabaseJwtClaims {
  /** users.id (uuid) — becomes auth.uid() in RLS policies */
  sub: string
  telegram_id: number
  /** seconds from now until expiry */
  expiresInSeconds: number
}

export async function signSupabaseJwt(claims: SupabaseJwtClaims, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: claims.sub,
    telegram_id: claims.telegram_id,
    iat: now,
    exp: now + claims.expiresInSeconds,
  }

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await hmacSha256Sign(secret, `${encodedHeader}.${encodedPayload}`)

  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`
}
