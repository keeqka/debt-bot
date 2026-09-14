import { createClient } from '@supabase/supabase-js'
import { env, isBackendConfigured } from '@/lib/env'

let sessionJwt: string | null = null

export function setSessionJwt(token: string | null) {
  sessionJwt = token
}

export function getSessionJwt() {
  return sessionJwt
}

/**
 * `supabase` is null in mock mode (no keys yet). Every call site must check
 * `isBackendConfigured` (or handle a null client) before using it directly —
 * `lib/api.ts` is the only place that should need to.
 *
 * We bypass Supabase's own Auth (custom Telegram-initData JWT instead, see
 * ТЗ §2 / lib/auth.ts), so the client is never told about a session the
 * normal way (`auth.setSession`). Without this custom `fetch`, every
 * `supabase.from(...)` call would carry only the anon key — RLS is scoped
 * `to authenticated`, so reads would silently come back empty (not an
 * error) instead of failing loudly. This injects the current session JWT
 * (read fresh on every call, not captured once at client creation) so
 * table reads/writes actually run as the logged-in user.
 *
 * Untyped on purpose during scaffolding: run `supabase gen types typescript`
 * against the real project once it exists and pass that as the generic here.
 */
export const supabase = isBackendConfigured
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers)
          if (sessionJwt) headers.set('Authorization', `Bearer ${sessionJwt}`)
          return fetch(input, { ...init, headers })
        },
      },
    })
  : null

/** Calls a Supabase Edge Function under `/functions/v1/<name>` with the current session JWT. */
export async function callFunction<TResponse>(name: string, body: unknown): Promise<TResponse> {
  if (!isBackendConfigured) {
    throw new Error(`callFunction("${name}") invoked without Supabase configured`)
  }
  const res = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionJwt ?? env.supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${name} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<TResponse>
}
