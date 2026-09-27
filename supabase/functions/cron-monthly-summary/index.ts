// ТЗ §7.4/§9: the cron schedule fires daily in the 28-31 window (pg_cron has
// no native "last day of month" trigger) — this function itself checks that
// today actually IS the last day before doing any work, so it only sends once.

import { jsonResponse } from '../_shared/cors.ts'
import { assertCronSecret, sendTelegramMessageWithRetry } from '../_shared/telegram-send.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getPeriodMetrics, metricsToPrompt, SUMMARY_TOOL } from '../_shared/summary.ts'
import { resolveBaseCurrency } from '../_shared/currency.ts'
import { PERSONA } from '../_shared/persona.ts'
import { listHouseholds } from '../_shared/households.ts'

function isLastDayOfMonth(date: Date): boolean {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === date.getDate()
}

Deno.serve(async (req) => {
  try {
    assertCronSecret(req)

    const now = new Date()
    if (!isLastDayOfMonth(now)) {
      return jsonResponse({ ok: true, skipped: 'not last day of month' })
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const supabase = getAdminClient()
    let sentAll = true

    // Family by family — each gets its own numbers, only its members get the message.
    for (const household of await listHouseholds(supabase)) {
      try {
        const [current, previous, currency] = await Promise.all([
          getPeriodMetrics(supabase, monthStart.toISOString().slice(0, 10), now.toISOString().slice(0, 10), household.id),
          getPeriodMetrics(supabase, prevMonthStart.toISOString().slice(0, 10), monthStart.toISOString().slice(0, 10), household.id),
          resolveBaseCurrency(supabase, household.id),
        ])

        const summary = await callClaudeTool<{ telegram_text: string }>({
          system: `${PERSONA}\n\nСоставь итог месяца для семьи: доходы/расходы/платежи по долгам, изменения по категориям, один приоритетный следующий шаг. period=month. telegram_text должен быть готов к прямой отправке в Telegram.`,
          messages: [{ role: 'user', content: `period=month\n${metricsToPrompt(current, previous, currency)}` }],
          tool: SUMMARY_TOOL,
        })

        const { data: insight } = await supabase
          .from('ai_insights')
          .insert({ type: 'monthly_summary', payload: summary, household_id: household.id })
          .select()
          .single()

        const results = await Promise.all(
          household.telegramIds.map((id) => sendTelegramMessageWithRetry(id, `*Итоги месяца*\n\n${summary.telegram_text}`)),
        )
        const allSent = results.every(Boolean)
        sentAll &&= allSent
        if (insight) await supabase.from('ai_insights').update({ sent_to_telegram: allSent }).eq('id', insight.id)
      } catch (error) {
        sentAll = false
        console.error('cron-monthly-summary: household failed', household.id, error)
      }
    }

    return jsonResponse({ ok: true, sent: sentAll })
  } catch (error) {
    console.error('cron-monthly-summary failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
