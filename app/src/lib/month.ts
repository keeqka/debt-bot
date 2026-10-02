import { computeBudget, type Budget, type BudgetInput, type PlanSettings } from '@/lib/budget'
import { simulate, type SimInput, type SimOverrides } from '@/lib/debt-sim'
import type { Debt, HouseholdSettings } from '@/types/domain'

export function toPlanSettings(s: HouseholdSettings): PlanSettings {
  return {
    mode: s.priority_mode,
    strategy: s.debt_strategy,
    cushionMonths: Number(s.cushion_months),
    splitDebtPct: Number(s.split_debt_pct),
    highRateThreshold: Number(s.high_rate_threshold),
    periodStartDay: s.period_start_day ?? null,
  }
}

export interface MonthCategory {
  id: string
  name: string
  amount: number
  /** Доля от потраченного за месяц (0-100) — то, что рисует полоса. */
  pct: number
  /** Обычно за месяц; null — истории ещё нет. */
  typical: number | null
  tone: 'accent' | 'warn'
}

/** Бюджет месяца в виде, удобном экранам. Все цифры — из computeBudget (lib/budget.ts). */
export interface Month extends Omit<Budget, 'categories'> {
  label: string
  categories: MonthCategory[]
}

export const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** «25 сен – 24 окт» — подпись бюджетного месяца, начинающегося не с 1-го числа. */
export function periodLabel(start: string, end: string) {
  const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`
  return `${fmt(start)} – ${fmt(end)}`
}

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export function computeMonth(input: BudgetInput): Month {
  const budget = computeBudget(input)
  const today = input.today ?? new Date()

  // Тревожный цвет — максимум один на экран (FUNCTIONAL.md §3): категория
  // с самым большим перерасходом против обычного. Пока истории нет, сравнивать
  // не с чем — тогда тревожна только категория, съевшая 90% бюджета на траты.
  const overspent = budget.signals.find((s) => s.kind === 'category')
  const warnId =
    overspent?.kind === 'category'
      ? overspent.categoryId
      : budget.historyMonths === 0 && budget.limit > 0
        ? budget.categories.find((c) => c.amount >= budget.limit * 0.9)?.id
        : undefined

  const categories = budget.categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      amount: c.amount,
      typical: c.typical,
      pct: budget.spent > 0 ? (c.amount / budget.spent) * 100 : 0,
      tone: (c.id === warnId ? 'warn' : 'accent') as MonthCategory['tone'],
    }))
    .sort((a, b) => (a.tone === 'warn' ? -1 : b.tone === 'warn' ? 1 : 0))
    .slice(0, 5)

  const label = budget.settings.periodStartDay == null ? MONTH_NAMES[today.getMonth()] : periodLabel(budget.periodStart, budget.periodEnd)
  return { ...budget, label, categories }
}

/** Вводные симуляции долгов из бюджета месяца: те же, с которыми считается «Свобода от долгов» на «Обзоре». */
export function simInputOf(month: Month, debts: Debt[]): SimInput {
  return {
    debts: debts
      .filter((d) => d.status === 'active' && d.current_balance > 0)
      .map((d) => ({ id: d.id, title: d.title, balance: d.current_balance, rate: d.interest_rate, min: d.minimum_payment + d.extra_monthly })),
    monthlyExtra: month.planExtra,
    settings: month.settings,
    cushionBalance: month.cushionBalance,
    monthlyNeed: month.monthlyNeed,
    start: new Date(),
  }
}

/**
 * Тот же план, но с другими вводными — «что если»: другая стратегия, другая
 * сумма сверх минимумов, только минимумы (rollover: false, extra 0).
 */
export function replan(month: Month, debts: Debt[], overrides: SimOverrides = {}) {
  return simulate(simInputOf(month, debts), overrides).plan
}
