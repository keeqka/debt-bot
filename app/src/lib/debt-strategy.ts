import type { Debt, DebtStrategyKind, DebtStrategyPlan } from '@/types/domain'

/**
 * Client-side avalanche simulation used for instant UI feedback and as the
 * mock-mode fallback. The real "source of truth" for a saved strategy is the
 * `debts/strategy` Edge Function (see supabase/functions/debts-strategy),
 * which asks Claude for the same shape plus a natural-language explanation —
 * this function mirrors the math described in ТЗ §6.1/§7.5 exactly so both
 * stay consistent.
 */

const EXTRA_PAYMENT_SHARE: Record<DebtStrategyKind, number> = {
  optimal: 0.15,
  aggressive: 0.65,
}

interface SimulationInput {
  debts: Debt[]
  /** income − mandatory living expenses − sum(minimum_payment), i.e. money free to allocate */
  monthlySurplus: number
  strategy: DebtStrategyKind
}

export function simulateDebtStrategy({ debts, monthlySurplus, strategy }: SimulationInput): DebtStrategyPlan {
  const active = debts.filter((d) => d.status === 'active' && d.current_balance > 0)
  const order = [...active].sort((a, b) => (b.interest_rate ?? 0) - (a.interest_rate ?? 0))
  const extraBudget = Math.max(0, monthlySurplus * EXTRA_PAYMENT_SHARE[strategy])

  const balances = new Map(order.map((d) => [d.id, d.current_balance]))
  let totalInterest = 0
  let month = 0
  const maxMonths = 600 // 50-year safety cap so a bad input can't loop forever

  while ([...balances.values()].some((b) => b > 0.5) && month < maxMonths) {
    month += 1
    let extraRemaining = extraBudget

    for (const debt of order) {
      const balance = balances.get(debt.id) ?? 0
      if (balance <= 0) continue

      const monthlyRate = (debt.interest_rate ?? 0) / 100 / 12
      const interest = balance * monthlyRate
      totalInterest += interest

      let payment = Math.min(debt.minimum_payment, balance + interest)
      if (extraRemaining > 0) {
        const extraForThis = Math.min(extraRemaining, balance + interest - payment)
        payment += extraForThis
        extraRemaining -= extraForThis
      }

      const newBalance = Math.max(0, balance + interest - payment)
      balances.set(debt.id, newBalance)
    }
  }

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    strategy,
    payoff_order: order.map((d) => d.id),
    monthly_plan: order.map((d) => ({
      debt_id: d.id,
      payment: d.minimum_payment + (order[0]?.id === d.id ? extraBudget : 0),
    })),
    estimated_payoff_date: payoffDate.toISOString().slice(0, 10),
    total_interest_paid: Math.round(totalInterest),
    explanation:
      strategy === 'optimal'
        ? `Порядок — по убыванию ставки (avalanche). На досрочное погашение направляется ~${Math.round(EXTRA_PAYMENT_SHARE.optimal * 100)}% свободного остатка, подушка безопасности сохраняется.`
        : `Тот же порядок avalanche, но на досрочное погашение направляется ~${Math.round(EXTRA_PAYMENT_SHARE.aggressive * 100)}% свободного остатка — срок короче, подушка минимальна.`,
  }
}
