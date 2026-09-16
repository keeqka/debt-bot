import type { Category, Debt, Expense, Income, User } from '@/types/domain'

export interface MonthCategory {
  id: string
  name: string
  amount: number
  /** Доля от ПОТРАЧЕННОГО за месяц (0-100) — то, что рисует полоса. */
  pct: number
  /** Доля от лимита месяца — по ней решается tone, но она не рисуется. */
  pctOfLimit: number
  tone: 'accent' | 'warn'
}

export interface Month {
  label: string
  daysLeft: number
  limit: number
  spent: number
  pending: number
  available: number
  perDay: number
  categories: MonthCategory[]
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

function isDueLaterThisMonth(dueDay: number, today: Date) {
  return dueDay >= today.getDate()
}

/**
 * Чистая клиентская агрегация. limit — автоматический (доход минус
 * обязательные платежи), руками его никто не задаёт.
 *
 * ВАЖНО про pct категорий: раньше полоса считалась от лимита всего месяца.
 * При доходе 1 055 000 и тратой 210 000 самая крупная категория давала 20%,
 * остальные — по 2-3%, и блок «По категориям» выглядел пустым и сломанным
 * (см. скриншот). Полоса теперь показывает долю от потраченного — тот же
 * смысл, что у дата-виджета в чате: «на что ушли деньги». Порог тревоги
 * по-прежнему считается от лимита (pctOfLimit), так что предупреждение
 * не потеряно.
 */
export function computeMonth(
  user: User | null,
  debts: Debt[],
  expenses: Expense[],
  incomes: Income[],
  categories: Category[],
  today = new Date(),
): Month {
  const activeDebts = debts.filter((d) => d.status === 'active')
  const monthExpenses = expenses.filter((e) => isThisMonth(e.spent_at, today) && e.is_confirmed)
  const monthIncomes = incomes.filter((i) => isThisMonth(i.received_at, today))

  const monthIncomeTotal = user?.monthly_income ?? monthIncomes.reduce((sum, i) => sum + i.amount, 0)
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
      pct: spent > 0 ? (amount / spent) * 100 : 0,
      pctOfLimit: limit > 0 ? (amount / limit) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // Только одна худшая категория выше 90% от лимита — не больше одного
  // тревожного цвета на экран.
  const worstOverIndex = categoryRows.findIndex((c) => c.pctOfLimit >= 90)
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
    hasIncome: user?.monthly_income != null || incomes.length > 0,
  }
}
