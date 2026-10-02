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
import { TONE_LINES, toneOf } from '../_shared/persona.ts'

interface ReminderUser {
  id: string
  telegram_id: number
  timezone: string
  daily_reminder_time: string
  bot_tone?: string
}

function localDateStr(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function localHour(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

// deno-lint-ignore no-explicit-any
async function sendDuePauseReminders(supabase: any): Promise<number> {
  const { data: due } = await supabase
    .from('reminders')
    .select('id, user_id, kind, payload, created_at, fire_at')
    .is('sent_at', null)
    .lte('fire_at', new Date().toISOString())
    .limit(100)
  let sent = 0
  for (const r of (due ?? []) as Array<{ id: string; user_id: string; kind: string; payload: Record<string, unknown>; created_at: string; fire_at: string }>) {
    const { data: user } = await supabase.from('users').select('telegram_id, bot_tone').eq('id', r.user_id).maybeSingle()
    if (!user) {
      await supabase.from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
      continue
    }
    const title = String(r.payload?.title ?? '').trim()
    const price = Number(r.payload?.price ?? 0)
    const what = `${title ? `«${title}»` : 'покупку'}${price > 0 ? ` за ${new Intl.NumberFormat('ru-RU').format(price)} ₸` : ''}`
    const hours = Math.max(1, Math.round((new Date(r.fire_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000))
    const ok = await sendTelegramMessageWithRetry(user.telegram_id, TONE_LINES.pauseOver[toneOf(user.bot_tone)](hours, what), 3, {
      inline_keyboard: [[{ text: 'Открыть долги', web_app: { url: `${env.miniAppUrl}/#/plan` } }]],
    })
    if (ok) {
      sent++
      await supabase.from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
    }
  }
  return sent
}

Deno.serve(async (req) => {
  try {
    assertCronSecret(req)

    const supabase = getAdminClient()

    // Напоминания «вернись к покупке» (reminders, SPEC-features 07) — не платная
    // функция и не зависят от ежедневного напоминания: отправляем всё, чей срок вышел.
    const pausesSent = await sendDuePauseReminders(supabase)

    // A paid-tier feature — only families whose subscription is active.
    const { data: subscriptions } = await supabase.from('subscriptions').select('household_id').eq('status', 'active')
    const activeHouseholds = new Set((subscriptions ?? []).map((s: { household_id: string }) => s.household_id))

    const { data: users } = await supabase
      .from('users')
      .select('id, household_id, telegram_id, timezone, daily_reminder_time, bot_tone')
      .eq('daily_reminder_enabled', true)
      .eq('vacation_paused', false)

    const now = new Date()
    const due = (users ?? []).filter(
      (u: ReminderUser & { household_id: string }) =>
        activeHouseholds.has(u.household_id) && localHour(now, u.timezone) === Number(u.daily_reminder_time.slice(0, 2)),
    )

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

      const tone = toneOf(user.bot_tone)
      const text = threeDayStreak ? TONE_LINES.dailyReminderStreak[tone] : TONE_LINES.dailyReminder[tone]

      const ok = await sendTelegramMessageWithRetry(user.telegram_id, text, 3, {
        inline_keyboard: [
          [{ text: 'Загрузить чек', web_app: { url: `${env.miniAppUrl}/#/receipt` } }],
          [{ text: 'Больше не напоминать', callback_data: 'disable_daily_reminder' }],
        ],
      })
      if (ok) sent++
    }

    return jsonResponse({ ok: true, due: due.length, sent, silent, pausesSent })
  } catch (error) {
    console.error('cron-daily-reminder failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
