import { computeBudget, type Budget, type BudgetInput } from '@/lib/budget'

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

const MONTH_NAMES = [
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

  return { ...budget, label: MONTH_NAMES[today.getMonth()], categories }
}
