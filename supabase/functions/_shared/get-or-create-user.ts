// Shared by auth-telegram (login) and telegram-webhook (receipts sent
// straight to the bot chat, outside the Mini App) — both need "find this
// Telegram user's app row, creating it on first contact." Never overwrites
// an existing display_name (e.g. a seeded nickname like "Ася") on repeat
// contact, only refreshes username/avatar.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface TelegramProfile {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}

export async function getOrCreateUser(admin: SupabaseLike, tgUser: TelegramProfile) {
  const { data: existing } = await admin.from('users').select('*').eq('telegram_id', tgUser.id).maybeSingle()

  if (existing) {
    const { data, error } = await admin
      .from('users')
      .update({ username: tgUser.username ?? null, avatar_url: tgUser.photo_url ?? null })
      .eq('telegram_id', tgUser.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `Telegram ${tgUser.id}`
  const { data, error } = await admin
    .from('users')
    .insert({ telegram_id: tgUser.id, display_name: displayName, username: tgUser.username ?? null, avatar_url: tgUser.photo_url ?? null })
    .select()
    .single()
  if (error) throw error
  return data
}
