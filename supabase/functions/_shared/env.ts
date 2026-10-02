/**
 * Typed access to Edge Function secrets. Set these with:
 *   supabase secrets set TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=... \
 *     SESSION_JWT_SECRET=... CRON_SECRET=... \
 *     MINI_APP_URL=https://debt-bot.pages.dev
 *
 * Note: this is the *value* of the project's JWT Secret (Settings → API →
 * JWT Keys), but it can't be stored under the name SUPABASE_JWT_SECRET —
 * Supabase rejects any custom secret whose name starts with SUPABASE_,
 * reserved for its own auto-injected vars. Hence SESSION_JWT_SECRET here.
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
    return required('SESSION_JWT_SECRET')
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
  /**
   * Deployed Mini App origin (no trailing slash) — the bot's «Открыть» button,
   * the daily reminder's deep link and the /report/<token> links. Public
   * anyway, so it defaults to the production host instead of failing when
   * nobody set MINI_APP_URL (CI never did); set it to override.
   */
  get miniAppUrl() {
    return (Deno.env.get('MINI_APP_URL') || 'https://debt-bot.pages.dev').replace(/\/+$/, '')
  },
}
