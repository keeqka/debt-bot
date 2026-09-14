// ТЗ §7.3: AI financial status (green -> red scale, §6.2).
//
// This endpoint ALWAYS computes a fresh status — it's no longer called
// automatically when the app opens (see src/lib/api.ts getStatus, which just
// reads the latest ai_insights row via PostgREST, no Claude call involved).
// The only callers are: the "Обновить" button in the UI, and
// cron-weekly-summary once a week. That's the entire cost-control story —
// no cache-guard needed here anymore, the caller IS the guard.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { computeAndStoreStatus } from '../_shared/compute-status.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const supabase = getUserClient(req.headers.get('Authorization')!)
    const result = await computeAndStoreStatus(supabase)
    return jsonResponse(result)
  } catch (error) {
    return jsonError('Не удалось оценить статус', error)
  }
})
