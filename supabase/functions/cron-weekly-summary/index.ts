// ТЗ §7.4/§9: runs Sunday 19:00 Asia/Almaty via pg_cron (see
// supabase/migrations/0002_cron.sql), summarizes the past 7 days and sends
// it to both whitelisted users in Telegram. Also the weekly "heartbeat" for
// the dashboard status card (ТЗ §6.2/§7.3) — this and the manual "Обновить"
// button in the UI are the ONLY two places that ever call Claude for status;
// opening the app just reads whatever was last stored here.

import { jsonResponse } from '../_shared/cors.ts'
import { assertCronSecret, sendTelegramMessageWithRetry } from '../_shared/telegram-send.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getPeriodMetrics, metricsToPrompt, SUMMARY_TOOL } from '../_shared/summary.ts'
import { computeAndStoreStatus } from '../_shared/compute-status.ts'
import { resolveBaseCurrency } from '../_shared/currency.ts'
import { PERSONA } from '../_shared/persona.ts'
import { listHouseholds } from '../_shared/households.ts'

Deno.serve(async (req) => {
  try {
    assertCronSecret(req)

    const now = new Date()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const supabase = getAdminClient()
    let sentAll = true

    // Family by family — each gets its own numbers, only its members get the message.
    for (const household of await listHouseholds(supabase)) {
      // Independent of the weekly digest below — refreshes the dashboard status card.
      try {
        await computeAndStoreStatus(supabase, household.id)
      } catch (error) {
        console.error('cron-weekly-summary: status refresh failed (continuing with the digest)', household.id, error)
      }

      try {
        const [current, previous, currency] = await Promise.all([
          getPeriodMetrics(supabase, weekStart.toISOString().slice(0, 10), now.toISOString().slice(0, 10), household.id),
          getPeriodMetrics(supabase, prevWeekStart.toISOString().slice(0, 10), weekStart.toISOString().slice(0, 10), household.id),
          resolveBaseCurrency(supabase, household.id),
        ])

        const summary = await callClaudeTool<{ telegram_text: string }>({
          system: `${PERSONA}\n\nСоставь еженедельный итог для семьи: как прошла неделя по расходам/доходам/долгам, один конкретный следующий шаг. period=week. telegram_text должен быть готов к прямой отправке в Telegram.`,
          messages: [{ role: 'user', content: `period=week\n${metricsToPrompt(current, previous, currency)}` }],
          tool: SUMMARY_TOOL,
        })

        const { data: insight } = await supabase
          .from('ai_insights')
          .insert({ type: 'weekly_summary', payload: summary, household_id: household.id })
          .select()
          .single()

        const results = await Promise.all(
          household.telegramIds.map((id) => sendTelegramMessageWithRetry(id, `*Итоги недели*\n\n${summary.telegram_text}`)),
        )
        const allSent = results.every(Boolean)
        sentAll &&= allSent
        if (insight) await supabase.from('ai_insights').update({ sent_to_telegram: allSent }).eq('id', insight.id)
      } catch (error) {
        sentAll = false
        console.error('cron-weekly-summary: household failed', household.id, error)
      }
    }

    return jsonResponse({ ok: true, sent: sentAll })
  } catch (error) {
    console.error('cron-weekly-summary failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
