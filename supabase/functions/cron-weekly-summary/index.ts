// Разбор недели (SPEC-features §10). pg_cron запускает функцию каждый день в
// 19:00 Asia/Almaty (см. 0024_phase3_literacy.sql), а она сама выбирает
// пользователей, у которых сегодня их день (users.weekly_review_dow): каждому —
// своя победа, поправка, веха и два челленджа в его тоне, с кнопкой в мини-апп
// (#/overview?review=1). Разбор сохраняется в ai_insights (weekly_review), мини-апп
// читает последний. Заодно это еженедельный «пульс» карточки статуса на Обзоре:
// обновляется один раз за запуск, когда в семье есть кому слать разбор.

import { jsonResponse } from '../_shared/cors.ts'
import { env } from '../_shared/env.ts'
import { assertCronSecret, sendTelegramMessageWithRetry } from '../_shared/telegram-send.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getPeriodMetrics, metricsToPrompt } from '../_shared/summary.ts'
import { computeAndStoreStatus } from '../_shared/compute-status.ts'
import { resolveBaseCurrency } from '../_shared/currency.ts'
import { PERSONA, toneOf, withTone } from '../_shared/persona.ts'
import { listHouseholds } from '../_shared/households.ts'
import { CHALLENGES, milestoneLevel, pickChallenges } from '../_shared/challenges.ts'

const REVIEW_TOOL = {
  name: 'report_week_review',
  description: 'Разбор недели: ровно одна победа и ровно одна поправка.',
  input_schema: {
    type: 'object',
    properties: {
      win: { type: 'string', description: 'Одна победа недели одним-двумя предложениями с конкретной цифрой. Без эмодзи и восклицаний.' },
      fix: { type: 'string', description: 'Одна поправка одним-двумя предложениями: что поправить и как. Без морали.' },
    },
    required: ['win', 'fix'],
  },
}

interface DueUser {
  id: string
  telegram_id: number
  timezone: string | null
  bot_tone: string | null
  weekly_review_dow: number
}

const localDow = (d: Date, timeZone: string): number => {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/** Markdown-символы из ответа ИИ вырезаем: бот шлёт legacy Markdown, одинокий «_» ломает сообщение. */
const clean = (s: string) => s.replace(/[_*`[\]]/g, '').trim()

const money = (n: number, symbol: string) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${symbol}`

Deno.serve(async (req) => {
  try {
    assertCronSecret(req)

    const now = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const weekStart = new Date(now.getTime() - 7 * 86_400_000)
    const prevWeekStart = new Date(now.getTime() - 14 * 86_400_000)
    const monthStart = new Date(now.getTime() - 30 * 86_400_000)
    const tomorrow = new Date(now.getTime() + 86_400_000)

    const supabase = getAdminClient()
    let sentAll = true
    let reviews = 0

    for (const household of await listHouseholds(supabase)) {
      try {
        const { data: users } = await supabase
          .from('users')
          .select('id, telegram_id, timezone, bot_tone, weekly_review_dow')
          .eq('household_id', household.id)
        const due = ((users ?? []) as DueUser[]).filter((u) => localDow(now, u.timezone || 'Asia/Almaty') === u.weekly_review_dow)
        if (due.length === 0) continue

        try {
          await computeAndStoreStatus(supabase, household.id)
        } catch (error) {
          console.error('cron-weekly-summary: status refresh failed (continuing with the review)', household.id, error)
        }

        const [current, previous, month, currency, settingsRes, debtsRes, lastRes, activeRes] = await Promise.all([
          getPeriodMetrics(supabase, iso(weekStart), iso(tomorrow), household.id),
          getPeriodMetrics(supabase, iso(prevWeekStart), iso(weekStart), household.id),
          getPeriodMetrics(supabase, iso(monthStart), iso(tomorrow), household.id),
          resolveBaseCurrency(supabase, household.id),
          supabase.from('household_settings').select('pause_threshold').eq('household_id', household.id).maybeSingle(),
          supabase.from('debts').select('principal_amount, current_balance').eq('household_id', household.id),
          supabase.from('ai_insights').select('payload').eq('type', 'weekly_review').eq('household_id', household.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('challenges').select('kind').eq('household_id', household.id).eq('status', 'active'),
        ])

        const debts = (debtsRes.data ?? []) as Array<{ principal_amount: number; current_balance: number }>
        const principal = debts.reduce((s, d) => s + Number(d.principal_amount), 0)
        const balance = debts.reduce((s, d) => s + Number(d.current_balance), 0)
        const level = milestoneLevel(principal, balance)
        const lastLevel = Number((lastRes.data?.payload as { milestone_level?: number } | null)?.milestone_level ?? 0)
        const milestone =
          level > lastLevel && level > 0 ? { pct: level, text: `Закрыто ${level}% долгов от начала — осталось ${100 - level}%.` } : null

        const challenges = pickChallenges({
          weekByCategory: current.byCategory,
          monthByCategory: month.byCategory,
          pauseThreshold: settingsRes.data?.pause_threshold != null ? Number(settingsRes.data.pause_threshold) : null,
          activeKinds: ((activeRes.data ?? []) as Array<{ kind: never }>).map((c) => c.kind),
        })

        for (const user of due) {
          const tone = toneOf(user.bot_tone)
          const review = await callClaudeTool<{ win: string; fix: string }>({
            system: `${withTone(PERSONA, tone)}\n\nРазбор недели для семьи: ровно одна победа и ровно одна поправка по расходам, доходам и долгам за неделю. Цифры — только из данных ниже, ничего не выдумывай. Если побед нет — назови то, что держится в норме.`,
            messages: [{ role: 'user', content: `period=week\n${metricsToPrompt(current, previous, currency)}` }],
            tool: REVIEW_TOOL,
            maxTokens: 800,
          })
          const payload = {
            week_of: iso(now),
            win: clean(review.win),
            fix: clean(review.fix),
            milestone,
            challenges,
            milestone_level: level,
          }

          const { data: insight } = await supabase.from('ai_insights').insert({ type: 'weekly_review', payload, household_id: household.id }).select().single()

          const lines = [
            '*Разбор недели*',
            '',
            `Победа: ${payload.win}`,
            `Поправка: ${payload.fix}`,
            ...(milestone ? ['', milestone.text] : []),
            '',
            'Челленджи на неделю:',
            ...challenges.map((c) => `• ${CHALLENGES[c.kind].title}${c.est_saving > 0 ? ` — до ${money(c.est_saving, currency === 'KZT' ? '₸' : currency)}` : ''}`),
          ]
          const ok = await sendTelegramMessageWithRetry(user.telegram_id, lines.join('\n'), 3, {
            inline_keyboard: [[{ text: 'Открыть разбор', web_app: { url: `${env.miniAppUrl}/#/overview?review=1` } }]],
          })
          sentAll &&= ok
          reviews++
          if (insight) await supabase.from('ai_insights').update({ sent_to_telegram: ok }).eq('id', insight.id)
        }
      } catch (error) {
        sentAll = false
        console.error('cron-weekly-summary: household failed', household.id, error)
      }
    }

    return jsonResponse({ ok: true, sent: sentAll, reviews })
  } catch (error) {
    console.error('cron-weekly-summary failed', error)
    return jsonResponse({ ok: false, error: String(error) }, 500)
  }
})
