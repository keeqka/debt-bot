// ТЗ §7.3: AI financial status (green -> red scale, §6.2). Cached in
// ai_insights for 24h so opening the dashboard repeatedly doesn't burn tokens.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { buildFinancialSnapshot, snapshotToPrompt } from '../_shared/finance-context.ts'

const STATUS_TOOL = {
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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const supabase = getUserClient(req.headers.get('Authorization')!)

    const { data: cached } = await supabase
      .from('ai_insights')
      .select('payload, created_at')
      .eq('type', 'status')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
      return jsonResponse(cached.payload)
    }

    const snapshot = await buildFinancialSnapshot(supabase)
    const result = await callClaudeTool({
      system:
        'Ты финансовый ассистент. Оцени текущее финансовое положение семьи по шкале от зелёного (отлично) до красного (тревога), опираясь на доходы, расходы, долги и цели за последние 30 дней. Учитывай долю обязательных платежей по долгам в доходе и скорость роста/снижения расходов. headline — по-русски, конкретно и без воды.',
      messages: [{ role: 'user', content: snapshotToPrompt(snapshot) }],
      tool: STATUS_TOOL,
    })

    await supabase.from('ai_insights').insert({ type: 'status', payload: result })

    return jsonResponse(result)
  } catch (error) {
    console.error('status failed', error)
    return jsonResponse({ error: 'Не удалось оценить статус' }, 500)
  }
})
