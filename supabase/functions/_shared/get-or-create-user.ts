// Access is invite-only (0017_households_and_invites.sql): a Telegram user
// becomes an app user only through redeem_invite, never implicitly. This
// finds an existing member and refreshes the profile bits Telegram owns
// (username/avatar) — display_name is never overwritten, so a nickname set
// in the app survives repeat logins.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface TelegramProfile {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}

export interface AppUser {
  id: string
  telegram_id: number
  household_id: string
  is_admin: boolean
  display_name: string
  [key: string]: unknown
}

export function displayNameOf(tgUser: TelegramProfile) {
  return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `Telegram ${tgUser.id}`
}

/** The member row for this Telegram user, or null if they haven't joined via an invite. */
export async function findMember(admin: SupabaseLike, tgUser: TelegramProfile): Promise<AppUser | null> {
  const { data: existing } = await admin.from('users').select('*').eq('telegram_id', tgUser.id).maybeSingle()
  if (!existing) return null
  const { data, error } = await admin
    .from('users')
    .update({ username: tgUser.username ?? null, avatar_url: tgUser.photo_url ?? null })
    .eq('telegram_id', tgUser.id)
    .select()
    .single()
  if (error) throw error
  return data as AppUser
}

/** Maps a Postgres exception raised by the invite functions to its code. */
export function inviteErrorCode(error: { message?: string } | null): string | null {
  const known = ['invite_invalid', 'limit_reached', 'family_full', 'forbidden', 'not_member']
  return known.find((code) => error?.message?.includes(code)) ?? null
}
