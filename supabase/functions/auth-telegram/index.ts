// ТЗ §2/§8: exchanges Telegram Mini App initData for a Supabase-compatible
// session JWT. This is the ONLY place the 2-person whitelist is enforced —
// every other function just trusts a valid, unexpired session (see
// _shared/auth.ts, which re-checks the whitelist defensively anyway in case
// TELEGRAM_ALLOWED_USER_IDS shrinks while a token is still live).

import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'
import { verifyTelegramInitData } from '../_shared/telegram-verify.ts'
import { signSupabaseJwt } from '../_shared/jwt.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getOrCreateUser } from '../_shared/get-or-create-user.ts'

const SESSION_TTL_SECONDS = 60 * 60 // ~1h, per ТЗ §2 step 4

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { initData } = await req.json()
    if (!initData) return jsonResponse({ error: 'initData is required' }, 400)

    const { user: tgUser } = await verifyTelegramInitData(initData, env.telegramBotToken)

    if (!env.allowedTelegramIds.includes(tgUser.id)) {
      return jsonResponse({ error: 'Доступ не предоставлен' }, 403)
    }

    const admin = getAdminClient()
    const user = await getOrCreateUser(admin, tgUser)

    const token = await signSupabaseJwt(
      { sub: user.id, telegram_id: tgUser.id, expiresInSeconds: SESSION_TTL_SECONDS },
      env.supabaseJwtSecret,
    )

    return jsonResponse({ token, user, expires_in: SESSION_TTL_SECONDS })
  } catch (error) {
    console.error('auth-telegram failed', error)
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
