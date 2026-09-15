import { useQuery, type QueryClient } from '@tanstack/react-query'
import { currentMockUser } from '@/lib/mock-data'
import { getInitData, isInsideTelegram } from '@/lib/telegram'
import { isBackendConfigured } from '@/lib/env'
import { callFunction, setSessionJwt } from '@/lib/supabase'
import type { User } from '@/types/domain'

interface AuthTelegramResponse {
  token: string
  user: User
}

export const CURRENT_USER_KEY = ['current-user'] as const

// Only read before the query cache is seeded — initSession runs (and is
// awaited) before the first render, so by the time any component calls
// useCurrentUser() below, the cache already has the real value.
let fallbackUser: User = currentMockUser

/**
 * Exchanges Telegram initData for a session JWT via the `auth-telegram` Edge
 * Function and seeds the query cache with the resolved user (id,
 * display_name, avatar_url, ...). Call once at boot, before rendering — see
 * main.tsx. Stays on the mock user when Supabase isn't configured yet, or
 * when opened outside Telegram during dev.
 */
export async function initSession(queryClient: QueryClient): Promise<void> {
  if (!isBackendConfigured) {
    queryClient.setQueryData(CURRENT_USER_KEY, currentMockUser)
    return
  }

  const initData = getInitData()
  if (!isInsideTelegram() || !initData) {
    console.warn('initSession: not running inside Telegram, staying on the mock user')
    queryClient.setQueryData(CURRENT_USER_KEY, currentMockUser)
    return
  }

  try {
    const { token, user } = await callFunction<AuthTelegramResponse>('auth-telegram', { initData })
    setSessionJwt(token)
    fallbackUser = user
    queryClient.setQueryData(CURRENT_USER_KEY, user)
  } catch (error) {
    console.error('initSession failed — falling back to mock user', error)
    queryClient.setQueryData(CURRENT_USER_KEY, currentMockUser)
  }
}

/**
 * The authenticated user's full row — a real reactive query now (used to be
 * a plain function reading a module-level variable nothing ever re-rendered
 * on), so editing the profile in Phase 6 actually updates every consumer.
 */
export function useCurrentUser(): User {
  const { data } = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: () => fallbackUser,
    initialData: fallbackUser,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return data
}

/** The authenticated user's `users.id` uuid (not the raw Telegram id). */
export function useCurrentUserId(): string {
  return useCurrentUser().id
}
