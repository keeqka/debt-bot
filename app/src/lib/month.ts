import type { Category, Debt, Expense, Income } from '@/types/domain'

export interface MonthCategory {
  id: string
  name: string
  amount: number
  pct: number
  tone: 'accent' | 'warn'
}

export interface Month {
  label: string
  daysLeft: number
  /** Auto: this month's recorded income minus active debts' minimum payments. Never user-set (confirmed decision — no per-category budget input). */
  limit: number
  spent: number
  /** Minimum payments on debts not yet due this month — "reserved", not spent yet. */
  pending: number
  available: number
  perDay: number
  categories: MonthCategory[]
  /** False before the user has ever logged an income — Overview falls back to a facts-only view instead of promising a budget it can't back up. */
  hasIncome: boolean
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function floorTo10(n: number) {
  return Math.floor(n / 10) * 10
}

function isThisMonth(iso: string, today: Date) {
  const d = new Date(iso)
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
}

/** True if this debt's due day this month hasn't passed yet — its minimum payment is "reserved", not spent. */
function isDueLaterThisMonth(dueDay: number, today: Date) {
  return dueDay >= today.getDate()
}

/**
 * Pure client-side aggregation — no edge function, everything here is
 * already fetched by Overview's existing hooks. `limit` is intentionally
 * automatic (income minus obligations), not a value anyone sets by hand —
 * see the redesign plan for why no per-category budget field exists.
 */
export function computeMonth(
  debts: Debt[],
  expenses: Expense[],
  incomes: Income[],
  categories: Category[],
  today = new Date(),
): Month {
  const activeDebts = debts.filter((d) => d.status === 'active')
  const monthExpenses = expenses.filter((e) => isThisMonth(e.spent_at, today) && e.is_confirmed)
  const monthIncomes = incomes.filter((i) => isThisMonth(i.received_at, today))

  const monthIncomeTotal = monthIncomes.reduce((sum, i) => sum + i.amount, 0)
  const totalMinPayments = activeDebts.reduce((sum, d) => sum + d.minimum_payment, 0)
  const pending = activeDebts
    .filter((d) => d.due_day != null && isDueLaterThisMonth(d.due_day, today))
    .reduce((sum, d) => sum + d.minimum_payment, 0)

  const limit = Math.max(0, monthIncomeTotal - totalMinPayments)
  const spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
  const available = limit - spent - pending

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - today.getDate() + 1
  const perDay = daysLeft > 0 ? floorTo10(available / daysLeft) : available

  const byCategory = new Map<string, number>()
  for (const e of monthExpenses) {
    const key = e.category_id ?? 'uncategorized'
    byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount)
  }
  const categoryRows = [...byCategory.entries()]
    .map(([id, amount]) => ({
      id,
      name: categories.find((c) => c.id === id)?.name ?? 'Без категории',
      amount,
      pct: limit > 0 ? (amount / limit) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5)

  // Only the single worst category over 90% is flagged — never more than one
  // warning color on screen at once (ТЗ FUNCTIONAL.md §3).
  const worstOverIndex = categoryRows.findIndex((c) => c.pct >= 90)
  const monthCategories: MonthCategory[] = categoryRows.map((c, i) => ({
    ...c,
    tone: i === worstOverIndex ? 'warn' : 'accent',
  }))

  return {
    label: MONTH_NAMES[today.getMonth()],
    daysLeft,
    limit,
    spent,
    pending,
    available,
    perDay,
    categories: monthCategories,
    hasIncome: incomes.length > 0,
  }
}
