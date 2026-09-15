import type { Debt, Expense } from '@/types/domain'
import type { MonthCategory } from '@/lib/month'

export interface Insight {
  text: string
  action: { label: string; to: string }
}

/** Days from `today` until the next occurrence of `dueDay` (1-31) this or next month. */
function daysUntilDueDay(dueDay: number, today: Date): number {
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay)
  const target = thisMonth >= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return Math.round((target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)
}

/**
 * One insight, highest priority first (ТЗ FUNCTIONAL.md §3): overspend
 * category > unused subscriptions > payment due within 3 days > duplicate
 * expense > nothing. Deterministic — no AI call, this runs on every render.
 *
 * "Unused subscriptions" isn't implemented yet: detecting a subscription at
 * all needs the recurring-merchant grouping Receipt's statement import adds
 * in a later phase — nothing here can tell a subscription apart from any
 * other recurring expense yet. Falls through to the next priority instead
 * of guessing.
 */
export function computeInsight(categories: MonthCategory[], debts: Debt[], monthExpenses: Expense[]): Insight | null {
  const overCategory = categories.find((c) => c.tone === 'warn')
  if (overCategory) {
    return {
      text: `«${overCategory.name}» почти выбрал лимит — ${Math.round(overCategory.pct)}% от бюджета месяца.`,
      action: { label: 'Разобрать', to: '/receipt' },
    }
  }

  const today = new Date()
  const upcoming = debts
    .filter((d): d is Debt & { due_day: number } => d.status === 'active' && d.due_day != null)
    .map((d) => ({ debt: d, daysUntil: daysUntilDueDay(d.due_day, today) }))
    .filter((d) => d.daysUntil <= 3)
    .sort((a, b) => a.daysUntil - b.daysUntil)[0]
  if (upcoming) {
    const when = upcoming.daysUntil === 0 ? 'сегодня' : `через ${upcoming.daysUntil} дн.`
    return {
      text: `Платёж по «${upcoming.debt.title}» — ${when}.`,
      action: { label: 'К долгам', to: '/debts' },
    }
  }

  const seen = new Set<string>()
  const duplicate = monthExpenses.find((e) => {
    const key = `${e.amount}|${e.merchant ?? ''}|${e.spent_at.slice(0, 10)}`
    if (seen.has(key)) return true
    seen.add(key)
    return false
  })
  if (duplicate) {
    return {
      text: `Похоже, трата «${duplicate.merchant ?? duplicate.description ?? 'без названия'}» записана дважды.`,
      action: { label: 'Проверить', to: '/receipt' },
    }
  }

  return null
}
