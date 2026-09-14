/**
 * Verifies Telegram Mini App `initData` per the official algorithm (ТЗ §8):
 *
 *   secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   hash       = hex(HMAC_SHA256(key=secret_key, message=data_check_string))
 *
 * where data_check_string is every initData field except `hash`, sorted by
 * key and joined as "key=value" lines with "\n".
 */

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface TelegramInitDataUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

export interface VerifiedInitData {
  user: TelegramInitDataUser
  authDate: number
}

const MAX_AGE_SECONDS = 24 * 60 * 60 // ТЗ §2: reject initData older than 24h

export async function verifyTelegramInitData(initData: string, botToken: string): Promise<VerifiedInitData> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new Error('initData missing hash')
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken)
  const computedHash = toHex(await hmacSha256(secretKey, dataCheckString))

  if (computedHash !== hash) {
    throw new Error('initData signature mismatch')
  }

  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
    throw new Error('initData expired')
  }

  const userRaw = params.get('user')
  if (!userRaw) throw new Error('initData missing user')

  return { user: JSON.parse(userRaw) as TelegramInitDataUser, authDate }
}
