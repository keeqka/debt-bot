import type { Debt, Expense } from '@/types/domain'
import type { Month } from '@/lib/month'

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

function isThisMonth(iso: string, today: Date) {
  return iso.slice(0, 7) === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

/**
 * One insight, most important first: overspend against the household's usual
 * month (a category, then the month as a whole) → payment due within 3 days →
 * an unusually large single expense → a new spending line → a duplicate.
 * Overspend leads because every tenge over the usual comes straight out of
 * the debt payoff plan (lib/budget.ts). Deterministic, no AI.
 */
export function computeInsight(month: Month, debts: Debt[], expenses: Expense[]): Insight | null {
  const today = new Date()
  const toReceipts = { label: 'Разобрать', to: '/receipt' }

  const overspend = month.signals.find((s) => s.kind === 'category' || s.kind === 'pace')
  if (overspend) return { text: overspend.text, action: toReceipts }

  const upcoming = debts
    .filter((d): d is Debt & { due_day: number } => d.status === 'active' && d.due_day != null)
    .map((d) => ({ debt: d, daysUntil: daysUntilDueDay(d.due_day, today) }))
    .filter((d) => d.daysUntil <= 3)
    .sort((a, b) => a.daysUntil - b.daysUntil)[0]
  if (upcoming) {
    const when = upcoming.daysUntil === 0 ? 'сегодня' : `через ${upcoming.daysUntil} дн`
    return {
      text: `Платёж по «${upcoming.debt.title}» — ${when}.`,
      action: { label: 'К долгам', to: '/debts' },
    }
  }

  const unusual = month.signals.find((s) => s.kind === 'anomaly' || s.kind === 'new_category')
  if (unusual) return { text: unusual.text, action: { label: 'Проверить', to: '/receipt' } }

  const seen = new Set<string>()
  const duplicate = expenses
    .filter((e) => e.is_confirmed && isThisMonth(e.spent_at, today))
    .find((e) => {
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
