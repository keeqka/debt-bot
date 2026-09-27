// Shared by status/index.ts (manual "Обновить" button, ТЗ §7.3) and
// cron-weekly-summary (weekly automatic refresh, ТЗ §9) — the two ONLY
// places allowed to trigger a status computation. Opening the app never
// calls Claude on its own; the frontend just reads the latest stored row
// (see api.ts getStatus / src/routes/Dashboard.tsx).

import { callClaudeTool } from './claude.ts'
import { buildFinancialSnapshot, snapshotToPrompt } from './finance-context.ts'
import { PERSONA } from './persona.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export const STATUS_TOOL = {
  name: 'report_status',
  description: 'Financial health assessment on the 5-level ТЗ §6.2 scale.',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['green', 'light_green', 'yellow', 'orange', 'red'] },
      score: { type: 'number', description: '0 to 100' },
      headline: {
        type: 'string',
        description: 'до 80 символов, голосом PERSONA: одна строка, цифра/причина и следующий шаг, без "рекомендуется" и без эмодзи — показывается на "Обзоре" как реплика маскота',
      },
      key_risks: { type: 'array', items: { type: 'string' } },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
    required: ['status', 'score', 'headline', 'key_risks', 'recommendations'],
  },
}

export interface StatusResult {
  status: 'green' | 'light_green' | 'yellow' | 'orange' | 'red'
  score: number
  headline: string
  key_risks: string[]
  recommendations: string[]
}

/** Calls Claude for a fresh status assessment and appends it to ai_insights (the frontend always reads the latest row). */
export async function computeAndStoreStatus(supabase: SupabaseLike): Promise<StatusResult> {
  const snapshot = await buildFinancialSnapshot(supabase)
  const result = await callClaudeTool<StatusResult>({
    system: `${PERSONA}\n\nОцени текущее финансовое положение семьи по шкале от зелёного (отлично) до красного (тревога). Главное: идут ли досрочные платежи в долги по плану и укладывается ли месяц в обычные траты. Опирайся только на цифры ниже — в них уже посчитаны бюджет месяца, перерасход и аномалии; не пересчитывай их сам. Headline — про самое важное из этого.`,
    messages: [{ role: 'user', content: snapshotToPrompt(snapshot) }],
    tool: STATUS_TOOL,
  })

  await supabase.from('ai_insights').insert({ type: 'status', payload: result })
  return result
}
