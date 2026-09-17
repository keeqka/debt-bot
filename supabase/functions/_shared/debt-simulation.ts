// Deterministic month-by-month amortization for debts-strategy — mirrors
// app/src/lib/debt-strategy.ts's runSimulation exactly (same "extra payment
// goes entirely to the first debt in the given order" rule), so the client's
// local estimate/chart and this saved plan always agree.
//
// Why this exists as a separate function instead of just asking Claude for
// estimated_payoff_date/monthly_plan/total_interest_paid directly: that's
// exact multi-month arithmetic, and asking an LLM to do it produced garbage
// like estimated_payoff_date: "2000-01-15" for a plan that should close in
// 2027. Claude is now only asked to explain a plan whose numbers are already
// computed here.

export interface DebtForSimulation {
  id: string
  current_balance: number
  interest_rate: number | null
  minimum_payment: number
}

const MAX_MONTHS = 600 // 50-year safety cap so a minimum payment below interest can't loop forever

export function simulateDebtPayoff(order: DebtForSimulation[], monthlySurplus: number) {
  const extraBudget = Math.max(0, monthlySurplus)
  const balances = new Map(order.map((d) => [d.id, d.current_balance]))

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

      balances.set(debt.id, Math.max(0, balance + interest - payment))
    }
  }

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    monthlyPlan: order.map((d, i) => ({
      debt_id: d.id,
      payment: d.minimum_payment + (i === 0 ? extraBudget : 0),
    })),
    // null when the surplus genuinely can't pay this off within 50 years
    // (e.g. minimum payments below interest) — the same "no real payoff
    // date" case the frontend already renders as "дата не определена",
    // never a guessed placeholder.
    estimatedPayoffDate: month < MAX_MONTHS ? payoffDate.toISOString().slice(0, 10) : null,
    totalInterestPaid: Math.round(totalInterest),
  }
}
