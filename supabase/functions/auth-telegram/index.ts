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
    const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')

    // Preserve a pre-set/custom display_name (e.g. a seeded nickname) across
    // logins instead of overwriting it with the real Telegram name every
    // time — username/avatar still refresh normally. New users get their
    // Telegram name on first login as before.
    const { data: existing } = await admin.from('users').select('id').eq('telegram_id', tgUser.id).maybeSingle()

    const { data: user, error } = existing
      ? await admin
          .from('users')
          .update({ username: tgUser.username ?? null, avatar_url: tgUser.photo_url ?? null })
          .eq('telegram_id', tgUser.id)
          .select()
          .single()
      : await admin
          .from('users')
          .insert({
            telegram_id: tgUser.id,
            display_name: displayName,
            username: tgUser.username ?? null,
            avatar_url: tgUser.photo_url ?? null,
          })
          .select()
          .single()

    if (error) throw error

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
