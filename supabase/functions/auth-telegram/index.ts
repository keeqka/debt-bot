// ТЗ §2/§8: exchanges Telegram Mini App initData for a session JWT.
//
// Access is invite-only (0017_households_and_invites.sql). An existing member
// just logs in. A newcomer must bring an invite code — either from the bot's
// "Открыть" button (`?invite=` in the app URL, passed here as `invite`) or a
// direct Mini App link (`start_param` inside initData). redeem_invite creates
// the user (and a new household for a family invite) atomically, enforcing
// the app-wide user limit and "one partner per family" in the database.
//
// The session JWT carries household_id — every RLS policy scopes by it.

import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'
import { verifyTelegramInitData } from '../_shared/telegram-verify.ts'
import { signSupabaseJwt } from '../_shared/jwt.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { displayNameOf, findMember, inviteErrorCode, type AppUser } from '../_shared/get-or-create-user.ts'

const SESSION_TTL_SECONDS = 60 * 60 // ~1h, per ТЗ §2 step 4

function inviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().replace(/^inv_/, '')
  return /^[a-f0-9]{8,32}$/.test(code) ? code : null
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { initData, invite } = await req.json()
    if (!initData) return jsonResponse({ error: 'initData is required' }, 400)

    const { user: tgUser } = await verifyTelegramInitData(initData, env.telegramBotToken)
    const admin = getAdminClient()

    let user: AppUser | null = await findMember(admin, tgUser)
    if (!user) {
      const code = inviteCode(invite) ?? inviteCode(new URLSearchParams(initData).get('start_param'))
      if (!code) return jsonResponse({ error: 'invite_required' }, 403)

      const { data, error } = await admin.rpc('redeem_invite', {
        p_code: code,
        p_telegram_id: tgUser.id,
        p_display_name: displayNameOf(tgUser),
        p_username: tgUser.username ?? null,
        p_avatar_url: tgUser.photo_url ?? null,
      })
      if (error) {
        const known = inviteErrorCode(error)
        if (known) return jsonResponse({ error: known }, 403)
        throw error
      }
      user = data as AppUser
    }

    const token = await signSupabaseJwt(
      { sub: user.id, telegram_id: tgUser.id, household_id: user.household_id, expiresInSeconds: SESSION_TTL_SECONDS },
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
