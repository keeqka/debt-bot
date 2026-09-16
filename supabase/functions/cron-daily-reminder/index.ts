// Hlow Flow redesign §9: unlike the weekly/monthly summaries (one broadcast
// to both users, on a fixed schedule), this is per-user — everyone's
// `daily_reminder_time` is individual, so pg_cron triggers this function
// once an hour (see 0013_cron_daily_reminder.sql) and it filters here for
// whoever's local hour matches right now. A paid-tier feature (landing
// Pricing's "Ежедневное напоминание загрузить чеки"), so it's a no-op
// entirely while the household subscription isn't active (Phase 8 stub).

import { jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'
import { assertCronSecret, sendTelegramMessageWithRetry } from '../_shared/telegram-send.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'

interface ReminderUser {
  id: string
  telegram_id: number
  timezone: string
  daily_reminder_time: string
}

function localDateStr(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function localHour(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

Deno.serve(async (req) => {
  try {
    assertCronSecret(req)

    const supabase = getAdminClient()

    const { data: subscription } = await supabase.from('subscriptions').select('status').limit(1).maybeSingle()
    if (subscription?.status !== 'active') {
      return jsonResponse({ ok: true, skipped: 'subscription not active' })
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, telegram_id, timezone, daily_reminder_time')
      .eq('daily_reminder_enabled', true)
      .eq('vacation_paused', false)

    const now = new Date()
    const due = (users ?? []).filter((u: ReminderUser) => localHour(now, u.timezone) === Number(u.daily_reminder_time.slice(0, 2)))

    let sent = 0
    let silent = 0

    for (const user of due as ReminderUser[]) {
      const since = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const { data: scans } = await supabase.from('receipt_scans').select('created_at').eq('user_id', user.id).gte('created_at', since)
      const scanDates = new Set((scans ?? []).map((s: { created_at: string }) => localDateStr(new Date(s.created_at), user.timezone)))

      const today = localDateStr(now, user.timezone)
      if (scanDates.has(today)) {
        silent++
        continue // already scanned something today — stay quiet, per ТЗ
      }

      const yesterday = localDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000), user.timezone)
      const dayBefore = localDateStr(new Date(now.getTime() - 48 * 60 * 60 * 1000), user.timezone)
      const threeDayStreak = !scanDates.has(yesterday) && !scanDates.has(dayBefore)

      const text = threeDayStreak
        ? '⏰ Уже третий день без чеков — картина бюджета устарела. Закинь хотя бы то, что накопилось, когда будет минутка.'
        : '⏰ Сегодня ещё не было ни одного чека — закинь фото, когда будет минутка.'

      const ok = await sendTelegramMessageWithRetry(user.telegram_id, text, 3, {
        inline_keyboard: [
          [{ text: '🧾 Загрузить чек', web_app: { url: `${env.miniAppUrl}/#/receipt` } }],
          [{ text: '🔕 Выключить напоминания', callback_data: 'disable_daily_reminder' }],
        ],
      })
      if (ok) sent++
    }

    return jsonResponse({ ok: true, due: due.length, sent, silent })
  } catch (error) {
    console.error('cron-daily-reminder failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
