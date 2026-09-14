// ТЗ §7.4/§9: the cron schedule fires daily in the 28-31 window (pg_cron has
// no native "last day of month" trigger) — this function itself checks that
// today actually IS the last day before doing any work, so it only sends once.

import { jsonResponse } from '../_shared/cors.ts'
import { assertCronSecret, sendTelegramMessageWithRetry } from '../_shared/telegram-send.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getPeriodMetrics, metricsToPrompt, SUMMARY_TOOL } from '../_shared/summary.ts'

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
    const [current, previous] = await Promise.all([
      getPeriodMetrics(supabase, monthStart.toISOString().slice(0, 10), now.toISOString().slice(0, 10)),
      getPeriodMetrics(supabase, prevMonthStart.toISOString().slice(0, 10), monthStart.toISOString().slice(0, 10)),
    ])

    const summary = await callClaudeTool({
      system:
        'Составь итог месяца для семьи из двух человек: доходы/расходы/платежи по долгам, изменения по категориям, один приоритетный совет на следующий месяц. Пиши по-русски, по делу. telegram_text должен быть готов к прямой отправке в Telegram.',
      messages: [{ role: 'user', content: `period=month\n${metricsToPrompt(current, previous)}` }],
      tool: SUMMARY_TOOL,
    })

    const { data: insight } = await supabase.from('ai_insights').insert({ type: 'monthly_summary', payload: summary }).select().single()

    const { data: users } = await supabase.from('users').select('telegram_id')
    const results = await Promise.all(
      (users ?? []).map((u: { telegram_id: number }) =>
        sendTelegramMessageWithRetry(u.telegram_id, `${summary.status_emoji} *Итоги месяца*\n\n${summary.telegram_text}`),
      ),
    )

    const allSent = results.every(Boolean)
    if (insight) await supabase.from('ai_insights').update({ sent_to_telegram: allSent }).eq('id', insight.id)

    return jsonResponse({ ok: true, sent: allSent })
  } catch (error) {
    console.error('cron-monthly-summary failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
