import { currentMockUser } from '@/lib/mock-data'
import { getInitData, isInsideTelegram } from '@/lib/telegram'
import { isBackendConfigured } from '@/lib/env'
import { callFunction, setSessionJwt } from '@/lib/supabase'
import type { User } from '@/types/domain'

interface AuthTelegramResponse {
  token: string
  user: User
}

let currentUser: User = currentMockUser

/**
 * Exchanges Telegram initData for a session JWT via the `auth-telegram` Edge
 * Function (ТЗ §2) and remembers the resolved user (id, display_name,
 * avatar_url, ...). Call once at boot, before rendering — see main.tsx.
 * No-ops (stays on the mock user) when Supabase isn't configured yet, or
 * when opened outside Telegram during dev.
 */
export async function initSession(): Promise<void> {
  if (!isBackendConfigured) return

  const initData = getInitData()
  if (!isInsideTelegram() || !initData) {
    console.warn('initSession: not running inside Telegram, staying on the mock user')
    return
  }

  try {
    const { token, user } = await callFunction<AuthTelegramResponse>('auth-telegram', { initData })
    setSessionJwt(token)
    currentUser = user
  } catch (error) {
    console.error('initSession failed — falling back to mock user', error)
  }
}

/** The authenticated user's `users.id` uuid (not the raw Telegram id). Resolved by initSession(). */
export function useCurrentUserId(): string {
  return currentUser.id
}

/** The authenticated user's full row (display_name, avatar_url, ...). Resolved by initSession(). */
export function useCurrentUser(): User {
  return currentUser
}
