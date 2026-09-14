// ТЗ §7.6: savings strategy for a goal. Bank product suggestions are grounded
// in the curated `bank_products` table (ТЗ §16 №4) — Claude picks from real
// rows by id rather than inventing rates, since accuracy matters for money.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { buildFinancialSnapshot, snapshotToPrompt } from '../_shared/finance-context.ts'

const GOAL_STRATEGY_TOOL = {
  name: 'report_goal_strategy',
  description: 'Savings plan for a financial goal, grounded in the provided bank product list.',
  input_schema: {
    type: 'object',
    properties: {
      monthly_contribution_needed: { type: 'number' },
      estimated_completion_date: { type: 'string', description: 'ISO date' },
      bank_product_suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bank_product_id: { type: 'string', description: 'must be one of the provided ids' },
            reasoning: { type: 'string' },
          },
          required: ['bank_product_id', 'reasoning'],
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
    },
    required: ['monthly_contribution_needed', 'estimated_completion_date', 'bank_product_suggestions', 'risks'],
  },
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const { goal_id } = await req.json()
    if (!goal_id) return jsonResponse({ error: 'goal_id is required' }, 400)

    const supabase = getUserClient(req.headers.get('Authorization')!)
    const [{ data: goal, error: goalError }, { data: bankProducts }] = await Promise.all([
      supabase.from('goals').select('*').eq('id', goal_id).single(),
      supabase.from('bank_products').select('id, bank_name, product_name, rate_percent, type'),
    ])
    if (goalError) throw goalError

    const snapshot = await buildFinancialSnapshot(supabase)
    const surplus = Math.max(0, snapshot.totalIncomeLast30d - snapshot.totalExpenseLast30d - snapshot.totalMinPayments)

    const result = await callClaudeTool({
      system:
        'Ты помогаешь спланировать накопление на цель. Предложи разумную ежемесячную сумму (не больше свободного остатка), реалистичную дату достижения цели и 1-3 банковских продукта СТРОГО из предоставленного списка (используй их id как есть, не придумывай новые продукты или ставки).',
      messages: [
        {
          role: 'user',
          content: `Цель: ${goal.title}, нужно накопить ${goal.target_amount - goal.current_amount} (уже есть ${goal.current_amount} из ${goal.target_amount})${goal.target_date ? `, желаемый срок: ${goal.target_date}` : ''}.\nСвободный остаток в месяц (после долгов): ${surplus}.\n${snapshotToPrompt(snapshot)}\n\nДоступные банковские продукты (id | банк | продукт | ставка | тип):\n${(bankProducts ?? [])
            .map((p) => `${p.id} | ${p.bank_name} | ${p.product_name} | ${p.rate_percent}% | ${p.type}`)
            .join('\n')}`,
        },
      ],
      tool: GOAL_STRATEGY_TOOL,
    })

    await supabase.from('goals').update({ ai_strategy: result, updated_at: new Date().toISOString() }).eq('id', goal_id)
    await supabase.from('ai_insights').insert({ type: 'goal_strategy', payload: result })

    return jsonResponse(result)
  } catch (error) {
    return jsonError('Не удалось рассчитать стратегию накопления', error)
  }
})
