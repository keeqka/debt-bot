// ТЗ §7.4/§9: runs Sunday 19:00 Asia/Almaty via pg_cron (see
// supabase/migrations/0002_cron.sql), summarizes the past 7 days and sends
// it to both whitelisted users in Telegram.

import { jsonResponse } from '../_shared/cors.ts'
import { assertCronSecret, sendTelegramMessageWithRetry } from '../_shared/telegram-send.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getPeriodMetrics, metricsToPrompt, SUMMARY_TOOL } from '../_shared/summary.ts'

Deno.serve(async (req) => {
  try {
    assertCronSecret(req)

    const now = new Date()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const supabase = getAdminClient()
    const [current, previous] = await Promise.all([
      getPeriodMetrics(supabase, weekStart.toISOString().slice(0, 10), now.toISOString().slice(0, 10)),
      getPeriodMetrics(supabase, prevWeekStart.toISOString().slice(0, 10), weekStart.toISOString().slice(0, 10)),
    ])

    const summary = await callClaudeTool({
      system:
        'Составь еженедельный итог для семьи из двух человек: как прошла неделя по расходам/доходам/долгам, один конкретный совет на следующую неделю. Пиши по-русски, тепло, но по делу, без воды. telegram_text должен быть готов к прямой отправке в Telegram.',
      messages: [{ role: 'user', content: `period=week\n${metricsToPrompt(current, previous)}` }],
      tool: SUMMARY_TOOL,
    })

    const { data: insight } = await supabase.from('ai_insights').insert({ type: 'weekly_summary', payload: summary }).select().single()

    const { data: users } = await supabase.from('users').select('telegram_id')
    const results = await Promise.all(
      (users ?? []).map((u: { telegram_id: number }) =>
        sendTelegramMessageWithRetry(u.telegram_id, `${summary.status_emoji} *Итоги недели*\n\n${summary.telegram_text}`),
      ),
    )

    const allSent = results.every(Boolean)
    if (insight) await supabase.from('ai_insights').update({ sent_to_telegram: allSent }).eq('id', insight.id)

    return jsonResponse({ ok: true, sent: allSent })
  } catch (error) {
    console.error('cron-weekly-summary failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
