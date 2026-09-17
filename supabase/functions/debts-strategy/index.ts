// Hlow Flow FUNCTIONAL.md §4: real avalanche (by rate, most expensive debt
// first) vs snowball (by balance, smallest debt first) — not two flavors of
// the same avalanche math this used to be. The payoff *order* is computed
// here deterministically (identical sort to the client's
// src/lib/debt-strategy.ts, so both always agree) and handed to Claude as a
// given — the model only prices the plan and explains it in words. Order is
// exactly the kind of thing that should never be left to an LLM's judgment.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeTool } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { resolveBaseCurrency, currencyInstruction } from '../_shared/currency.ts'
import { simulateDebtPayoff } from '../_shared/debt-simulation.ts'

const EXPLANATION_TOOL = {
  name: 'report_debt_strategy',
  description: 'Explains an already-priced debt payoff plan in a couple of sentences.',
  input_schema: {
    type: 'object',
    properties: {
      explanation: { type: 'string', description: 'по-русски, 2-3 предложения, суммы в указанной валюте' },
    },
    required: ['explanation'],
  },
}

interface DebtRow {
  id: string
  title: string
  current_balance: number
  interest_rate: number | null
  minimum_payment: number
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    await requireSession(req)
    const { strategy, monthly_surplus } = await req.json()
    if (strategy !== 'avalanche' && strategy !== 'snowball') {
      return jsonResponse({ error: 'strategy must be "avalanche" or "snowball"' }, 400)
    }

    const supabase = getUserClient(req.headers.get('Authorization')!)
    const { data, error } = await supabase
      .from('debts')
      .select('id, title, current_balance, interest_rate, minimum_payment, currency')
      .eq('status', 'active')
    if (error) throw error
    const debts = (data ?? []) as DebtRow[]

    const order =
      strategy === 'avalanche'
        ? [...debts].sort((a, b) => (b.interest_rate ?? 0) - (a.interest_rate ?? 0))
        : [...debts].sort((a, b) => a.current_balance - b.current_balance)

    const currency = await resolveBaseCurrency(supabase)
    const algorithmLabel = strategy === 'avalanche' ? 'по убыванию ставки (avalanche)' : 'по возрастанию остатка (snowball)'

    // The payoff date, monthly plan and total interest are exact multi-month
    // arithmetic — computed here, not asked of Claude (it used to invent
    // values like estimated_payoff_date: "2000-01-15" when asked to do this
    // itself). Claude only turns the already-correct numbers into prose.
    const { monthlyPlan, estimatedPayoffDate, totalInterestPaid } = simulateDebtPayoff(
      order.map((d) => ({ id: d.id, current_balance: d.current_balance, interest_rate: d.interest_rate, minimum_payment: d.minimum_payment })),
      monthly_surplus,
    )

    const { explanation } = await callClaudeTool({
      system: `Долги упорядочены ${algorithmLabel}. Объясни план своими словами, не пересчитывая и не называя других цифр, кроме уже данных. ${currencyInstruction(currency)}`,
      messages: [
        {
          role: 'user',
          content: `Свободный остаток в месяц: ${monthly_surplus}\nДолги в порядке погашения (название, остаток, ставка %, мин. платёж):\n${order
            .map((d) => `${d.title} | ${d.current_balance} | ${d.interest_rate ?? 0}% | ${d.minimum_payment}`)
            .join('\n')}\n\nУже посчитано: дата полного погашения — ${estimatedPayoffDate ?? 'не наступит, минимальный платёж не покрывает проценты'}, переплата по процентам — ${totalInterestPaid}.`,
        },
      ],
      tool: EXPLANATION_TOOL,
    })

    const payload = {
      strategy,
      payoff_order: order.map((d) => d.id),
      monthly_plan: monthlyPlan,
      estimated_payoff_date: estimatedPayoffDate,
      total_interest_paid: totalInterestPaid,
      explanation,
    }
    await supabase.from('ai_insights').insert({ type: 'debt_strategy', payload })

    return jsonResponse(payload)
  } catch (error) {
    return jsonError('Не удалось рассчитать стратегию', error)
  }
})
