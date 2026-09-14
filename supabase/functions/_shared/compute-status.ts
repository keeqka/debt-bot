// Shared by status/index.ts (manual "Обновить" button, ТЗ §7.3) and
// cron-weekly-summary (weekly automatic refresh, ТЗ §9) — the two ONLY
// places allowed to trigger a status computation. Opening the app never
// calls Claude on its own; the frontend just reads the latest stored row
// (see api.ts getStatus / src/routes/Dashboard.tsx).

import { callClaudeTool } from './claude.ts'
import { buildFinancialSnapshot, snapshotToPrompt } from './finance-context.ts'

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
      headline: { type: 'string', description: 'до 80 символов' },
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
    system:
      'Ты финансовый ассистент. Оцени текущее финансовое положение семьи по шкале от зелёного (отлично) до красного (тревога), опираясь на доходы, расходы, долги и цели за последние 30 дней. Учитывай долю обязательных платежей по долгам в доходе и скорость роста/снижения расходов. headline — по-русски, конкретно и без воды.',
    messages: [{ role: 'user', content: snapshotToPrompt(snapshot) }],
    tool: STATUS_TOOL,
  })

  await supabase.from('ai_insights').insert({ type: 'status', payload: result })
  return result
}
