import type { Debt, DebtStrategyKind, DebtStrategyPlan } from '@/types/domain'

/**
 * Client-side avalanche simulation used for instant UI feedback, the
 * mock-mode fallback, and the payoff chart (ТЗ §6.1/§7.5). The real
 * "source of truth" for the saved strategy numbers is the debts-strategy
 * Edge Function (Claude), which returns the same shape plus a
 * natural-language explanation — this mirrors that math exactly so both
 * stay consistent. The chart is always computed here rather than asked of
 * Claude: precise month-by-month arithmetic over years is exactly the kind
 * of thing a deterministic simulation should own, not a model.
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

export interface TimelinePoint {
  month: number
  /** ISO date (first of month) this point represents */
  date: string
  /** combined remaining balance across all debts in the simulation */
  balance: number
}

interface SimulationRun {
  order: Debt[]
  totalInterest: number
  months: number
  timeline: TimelinePoint[]
}

const MAX_MONTHS = 600 // 50-year safety cap so a bad input can't loop forever
const MAX_TIMELINE_POINTS = 120 // 10 years of monthly points is plenty for a chart

function runAvalancheSimulation({ debts, monthlySurplus, strategy }: SimulationInput): SimulationRun {
  const active = debts.filter((d) => d.status === 'active' && d.current_balance > 0)
  const order = [...active].sort((a, b) => (b.interest_rate ?? 0) - (a.interest_rate ?? 0))
  const extraBudget = Math.max(0, monthlySurplus * EXTRA_PAYMENT_SHARE[strategy])

  const balances = new Map(order.map((d) => [d.id, d.current_balance]))
  const startBalance = [...balances.values()].reduce((sum, b) => sum + b, 0)
  const timeline: TimelinePoint[] = [{ month: 0, date: new Date().toISOString().slice(0, 10), balance: Math.round(startBalance) }]

  let totalInterest = 0
  let month = 0

  while ([...balances.values()].some((b) => b > 0.5) && month < MAX_MONTHS) {
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

    if (month <= MAX_TIMELINE_POINTS) {
      const totalBalance = [...balances.values()].reduce((sum, b) => sum + b, 0)
      const date = new Date()
      date.setMonth(date.getMonth() + month)
      timeline.push({ month, date: date.toISOString().slice(0, 10), balance: Math.round(totalBalance) })
    }
  }

  return { order, totalInterest, months: month, timeline }
}

export function simulateDebtStrategy(input: SimulationInput): DebtStrategyPlan {
  const { strategy, monthlySurplus } = input
  const { order, totalInterest, months } = runAvalancheSimulation(input)
  const extraBudget = Math.max(0, monthlySurplus * EXTRA_PAYMENT_SHARE[strategy])

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + months)

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

/** Month-by-month combined balance for the payoff chart — see runAvalancheSimulation. */
export function simulateDebtTimeline(input: SimulationInput): TimelinePoint[] {
  return runAvalancheSimulation(input).timeline
}
