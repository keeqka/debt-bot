import { currentMockUser } from '@/lib/mock-data'
import { getInitData, isInsideTelegram } from '@/lib/telegram'
import { isBackendConfigured } from '@/lib/env'
import { callFunction, setSessionJwt } from '@/lib/supabase'

interface AuthTelegramResponse {
  token: string
  user: { id: string; telegram_id: number; display_name: string }
}

let currentUserId: string = currentMockUser.id

/**
 * Exchanges Telegram initData for a session JWT via the `auth-telegram` Edge
 * Function (ТЗ §2) and remembers the resolved app-side user id. Call once at
 * boot, before rendering — see main.tsx. No-ops (stays on the mock user) when
 * Supabase isn't configured yet, or when opened outside Telegram during dev.
 */
export async function initSession(): Promise<void> {
  if (!isBackendConfigured) return

  const initData = getInitData()
  if (!isInsideTelegram() || !initData) {
    console.warn('initSession: not running inside Telegram, staying on the mock user id')
    return
  }

  try {
    const { token, user } = await callFunction<AuthTelegramResponse>('auth-telegram', { initData })
    setSessionJwt(token)
    currentUserId = user.id
  } catch (error) {
    console.error('initSession failed — falling back to mock user id', error)
  }
}

/** The authenticated user's `users.id` uuid (not the raw Telegram id). Resolved by initSession(). */
export function useCurrentUserId(): string {
  return currentUserId
}
