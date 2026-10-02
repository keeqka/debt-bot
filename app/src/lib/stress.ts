import { budgetPeriod, computeBudget, type BudgetInput } from '@/lib/budget'

/**
 * Стресс-тест подушки (01): на сколько месяцев её хватит, если случится плохое.
 * Ничего не сохраняет — только расчёт. «Подушки хватит на N мес» = подушка /
 * (обычные траты + платежи по долгам − оставшийся доход). Если доход покрывает
 * всё, подушка не тратится — месяцев «сколько угодно» (coverMonths = null).
 */

export type StressScenario = 'income_minus_30' | 'job_loss' | 'rate_plus_5' | 'custom'

export interface StressCut {
  name: string
  /** Средняя сумма в месяц за последние месяцы. */
  avg: number
}

export interface StressResult {
  scenario: StressScenario
  baseIncome: number
  income: number
  /** Обычные траты в месяц и платежи по долгам в сценарии. */
  spend: number
  payments: number
  /** Сколько в месяц уходит из подушки: spend + payments − income; ≤ 0 — подушка не тратится. */
  burn: number
  cushionBalance: number
  /** Месяцев, на которые хватит подушки; null — она не тратится. */
  coverMonths: number | null
  /** Цель из настроек: на сколько месяцев должна хватать подушка. */
  targetMonths: number
  /** Необязательные категории, которые урезаются первыми (топ-3 по средней сумме). */
  cuts: StressCut[]
  burnAfterCuts: number
  monthsAfterCuts: number | null
}

const RATE_SHOCK_PCT = 5

function months(balance: number, burn: number): number | null {
  if (burn <= 0) return null
  return Math.round((balance / burn) * 10) / 10
}

export function stressTest(input: BudgetInput, scenario: StressScenario, customIncome = 0): StressResult {
  const b = computeBudget(input)
  const today = input.today ?? new Date()
  const startDay = input.settings.periodStartDay ?? null

  const activeDebts = input.debts.filter((d) => d.status === 'active' && d.current_balance > 0)
  const basePayments = activeDebts.reduce((s, d) => s + d.minimum_payment + (d.extra_monthly ?? 0), 0)
  // Ставка +5 п.п.: проценты на остаток растут — это дополнительно к платежу каждый месяц.
  const rateShock = activeDebts.reduce((s, d) => s + (d.current_balance * (RATE_SHOCK_PCT / 100)) / 12, 0)

  const income =
    scenario === 'income_minus_30' ? b.income * 0.7 : scenario === 'job_loss' ? 0 : scenario === 'custom' ? Math.max(0, customIncome) : b.income
  const payments = basePayments + (scenario === 'rate_plus_5' ? rateShock : 0)
  const spend = b.typicalSpend
  const burn = spend + payments - income

  // Необязательное: категории с need_kind = 'want' за последние три бюджетных месяца.
  const periods = [1, 2, 3].map((back) => budgetPeriod(today, startDay, back))
  const perCategory = new Map<string, number>()
  const activePeriods = new Set<number>()
  for (const e of input.expenses) {
    if (!e.is_confirmed || !e.category_id || input.categoryNeedKinds?.[e.category_id] !== 'want') continue
    const day = e.spent_at.slice(0, 10)
    const idx = periods.findIndex((p) => day >= p.start && day <= p.end)
    if (idx === -1) continue
    activePeriods.add(idx)
    perCategory.set(e.category_id, (perCategory.get(e.category_id) ?? 0) + e.amount)
  }
  const divisor = Math.max(1, activePeriods.size)
  const cuts = [...perCategory.entries()]
    .map(([id, total]) => ({ name: input.categoryNames[id] ?? 'Без категории', avg: Math.round(total / divisor) }))
    .sort((a, c) => c.avg - a.avg)
    .slice(0, 3)
  const cutsTotal = cuts.reduce((s, c) => s + c.avg, 0)
  const burnAfterCuts = burn - cutsTotal

  return {
    scenario,
    baseIncome: b.income,
    income,
    spend,
    payments,
    burn,
    cushionBalance: b.cushionBalance,
    coverMonths: months(b.cushionBalance, burn),
    targetMonths: input.settings.cushionMonths,
    cuts,
    burnAfterCuts,
    monthsAfterCuts: months(b.cushionBalance, burnAfterCuts),
  }
}
