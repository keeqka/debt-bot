import type { Debt, DebtStrategyKind, DebtStrategyPlan } from '@/types/domain'

/**
 * Client-side debt-payoff simulation used for instant UI feedback, the
 * mock-mode fallback, and the payoff chart. The real "source of truth" for
 * the saved strategy numbers is the debts-strategy Edge Function (Claude),
 * which is given this exact same deterministic order and asked only to
 * price it and explain it in words — this mirrors that math exactly so
 * both stay consistent. The chart is always computed here rather than
 * asked of Claude: precise month-by-month arithmetic over years is exactly
 * the kind of thing a deterministic simulation should own, not a model.
 *
 * Two real algorithms (ТЗ FUNCTIONAL.md §4), not two flavors of the same
 * one: avalanche sorts by interest rate (most expensive debt first, saves
 * the most money); snowball sorts by balance (smallest debt first, clears
 * a debt off the list soonest — a motivation play, honestly a worse deal
 * in interest). The whole monthly surplus goes to extra payment on
 * whichever debt is first in that order — there's no separate
 * "aggressiveness" dial; the surplus input on the Debts screen already is
 * that dial, directly.
 */

function sortOrder(debts: Debt[], algorithm: DebtStrategyKind): Debt[] {
  const active = debts.filter((d) => d.status === 'active' && d.current_balance > 0)
  return algorithm === 'avalanche'
    ? [...active].sort((a, b) => (b.interest_rate ?? 0) - (a.interest_rate ?? 0))
    : [...active].sort((a, b) => a.current_balance - b.current_balance)
}

/** Deterministic one-line reason per position — not asked of Claude, it's a pure function of algorithm + rank. */
export function debtPayoffNote(index: number, algorithm: DebtStrategyKind): string {
  if (index !== 0) return 'Минимальный платёж, пока не дойдёт очередь'
  return algorithm === 'avalanche' ? 'Гасим первой — дороже всех по ставке' : 'Гасим первой — закроется быстрее всех'
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

function runSimulation({ debts, monthlySurplus, strategy }: SimulationInput): SimulationRun {
  const order = sortOrder(debts, strategy)
  const extraBudget = Math.max(0, monthlySurplus)

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
  const { order, totalInterest, months } = runSimulation(input)

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + months)

  return {
    strategy,
    payoff_order: order.map((d) => d.id),
    monthly_plan: order.map((d, i) => ({
      debt_id: d.id,
      payment: d.minimum_payment + (i === 0 ? Math.max(0, monthlySurplus) : 0),
    })),
    estimated_payoff_date: payoffDate.toISOString().slice(0, 10),
    total_interest_paid: Math.round(totalInterest),
    explanation:
      strategy === 'avalanche'
        ? 'Порядок — по убыванию ставки (avalanche): весь свободный остаток идёт на самый дорогой долг, это экономит больше всего на процентах.'
        : 'Порядок — по возрастанию остатка (snowball): весь свободный остаток идёт на самый маленький долг, чтобы он закрылся быстрее всего — на процентах это обычно проигрывает лавине.',
  }
}

/** Month-by-month combined balance for the payoff chart — see runSimulation. */
export function simulateDebtTimeline(input: SimulationInput): TimelinePoint[] {
  return runSimulation(input).timeline
}
