import { createClient } from '@supabase/supabase-js'
import { env, isBackendConfigured } from '@/lib/env'

/**
 * `supabase` is null in mock mode (no keys yet). Every call site must check
 * `isBackendConfigured` (or handle a null client) before using it directly —
 * `lib/api.ts` is the only place that should need to.
 *
 * Untyped on purpose during scaffolding: run `supabase gen types typescript`
 * against the real project once it exists and pass that as the generic here.
 */
export const supabase = isBackendConfigured
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: false },
    })
  : null

let sessionJwt: string | null = null

export function setSessionJwt(token: string | null) {
  sessionJwt = token
}

export function getSessionJwt() {
  return sessionJwt
}

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
