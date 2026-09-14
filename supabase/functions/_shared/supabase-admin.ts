import { createClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'

/** Service-role client — bypasses RLS. Only for trusted server-side use (auth mint, cron). */
export function getAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

/** Client scoped to the caller's own JWT — respects RLS as that user. */
export function getUserClient(authHeader: string) {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
}
