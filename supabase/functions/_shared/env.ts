/**
 * Typed access to Edge Function secrets. Set these with:
 *   supabase secrets set TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=... \
 *     SUPABASE_JWT_SECRET=... CRON_SECRET=... TELEGRAM_ALLOWED_USER_IDS=111,222
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
 * the Supabase platform — no need to set those yourself.
 */
function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL')
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY')
  },
  get supabaseJwtSecret() {
    return required('SUPABASE_JWT_SECRET')
  },
  get telegramBotToken() {
    return required('TELEGRAM_BOT_TOKEN')
  },
  get anthropicApiKey() {
    return required('ANTHROPIC_API_KEY')
  },
  get cronSecret() {
    return required('CRON_SECRET')
  },
  /** Comma-separated Telegram user ids — the whole point of ТЗ §2/§13: exactly 2 people, hardcoded. */
  get allowedTelegramIds(): number[] {
    return required('TELEGRAM_ALLOWED_USER_IDS')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id))
  },
}
