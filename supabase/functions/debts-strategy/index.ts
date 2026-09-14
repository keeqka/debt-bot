// ТЗ §7.5: debt payoff strategy (optimal vs aggressive avalanche, §6.1).
// The client already runs the same math locally (src/lib/debt-strategy.ts)
// for instant feedback — this endpoint is the source of truth once a
// backend exists, adding a natural-language explanation on top of the numbers.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'

const STRATEGY_TOOL = {
  name: 'report_debt_strategy',
  description: 'Debt payoff plan using the avalanche method (ТЗ §6.1).',
  input_schema: {
    type: 'object',
    properties: {
      strategy: { type: 'string', enum: ['optimal', 'aggressive'] },
      payoff_order: { type: 'array', items: { type: 'string' }, description: 'debt ids, highest interest rate first' },
      monthly_plan: {
        type: 'array',
        items: {
          type: 'object',
          properties: { debt_id: { type: 'string' }, payment: { type: 'number' } },
          required: ['debt_id', 'payment'],
        },
      },
      estimated_payoff_date: { type: 'string', description: 'ISO date' },
      total_interest_paid: { type: 'number' },
      explanation: { type: 'string', description: 'по-русски, 2-3 предложения' },
    },
    required: ['strategy', 'payoff_order', 'monthly_plan', 'estimated_payoff_date', 'total_interest_paid', 'explanation'],
  },
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const { strategy, monthly_surplus } = await req.json()
    if (strategy !== 'optimal' && strategy !== 'aggressive') {
      return jsonResponse({ error: 'strategy must be "optimal" or "aggressive"' }, 400)
    }

    const supabase = getUserClient(req.headers.get('Authorization')!)
    const { data: debts, error } = await supabase
      .from('debts')
      .select('id, title, current_balance, interest_rate, minimum_payment')
      .eq('status', 'active')
    if (error) throw error

    const extraShare = strategy === 'optimal' ? '10-20%' : '50-80%'
    const result = await callClaudeTool({
      system: `Ты рассчитываешь план погашения долгов методом "лавины" (сначала долг с наибольшей ставкой). На досрочное погашение направляй ${extraShare} свободного остатка сверх минимальных платежей. Верни порядок долгов по их id, план ежемесячных платежей, ожидаемую дату полного погашения и итоговую переплату по процентам.`,
      messages: [
        {
          role: 'user',
          content: `Стратегия: ${strategy}\nСвободный остаток в месяц: ${monthly_surplus}\nДолги (id, название, остаток, ставка %, мин. платёж):\n${(debts ?? [])
            .map((d) => `${d.id} | ${d.title} | ${d.current_balance} | ${d.interest_rate ?? 0}% | ${d.minimum_payment}`)
            .join('\n')}`,
        },
      ],
      tool: STRATEGY_TOOL,
    })

    await supabase.from('ai_insights').insert({ type: 'debt_strategy', payload: result })

    return jsonResponse(result)
  } catch (error) {
    return jsonError('Не удалось рассчитать стратегию', error)
  }
})
