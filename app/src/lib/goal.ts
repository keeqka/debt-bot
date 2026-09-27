import type { Goal } from '@/types/domain'
import type { Month } from '@/lib/month'

/**
 * Сколько в месяц пойдёт на цели. Сначала долги (lib/budget.ts): пока они
 * есть, на цели не идёт ничего, а после закрытия освобождаются и досрочные,
 * и минимальные платежи — доход минус обычные траты.
 */
export function goalMoneyPerMonth(month: Month) {
  return month.planTarget === 'debts'
    ? Math.max(0, Math.floor((month.income - month.typicalSpend) / 1000) * 1000)
    : Math.max(0, Math.floor(month.freeMonthly / 1000) * 1000)
}

/** Когда цель соберётся, если всё, что идёт на цели, класть в неё — начиная с закрытия долгов. */
export function forecastGoalFromBudget(goal: Goal, month: Month, debtFreeDate: string | null | undefined): Date | null {
  const left = Math.max(0, goal.target_amount - goal.current_amount)
  if (left === 0) return new Date()
  const perMonth = goalMoneyPerMonth(month)
  if (perMonth <= 0) return null
  const start = month.planTarget === 'debts' ? (debtFreeDate ? new Date(debtFreeDate) : null) : new Date()
  if (!start) return null
  const date = new Date(start)
  date.setMonth(date.getMonth() + Math.ceil(left / perMonth))
  return date
}

/**
 * Арифметика цели на клиенте. Нужна потому, что `ai_strategy` считается кроном
 * и у только что созданной цели она null — а «сколько откладывать в месяц»
 * человек должен увидеть сразу, в момент создания, иначе форма просит цифры и
 * ничего не отвечает взамен.
 *
 * Если стратегия уже есть — она главнее: там учтены доходы, долги и ставки.
 */
export interface GoalMath {
  /** 0–100, уже обрезано */
  pct: number
  left: number
  /** Полных месяцев до целевой даты; null, если даты нет или она в прошлом. */
  monthsLeft: number | null
  /** Сколько откладывать в месяц, чтобы успеть. null — если срока нет. */
  monthlyNeeded: number | null
  /** true — стратегия посчитана AI, а не прикидка по дате. */
  fromStrategy: boolean
  done: boolean
}

export function goalMath(goal: Goal): GoalMath {
  const target = goal.target_amount || 0
  const left = Math.max(0, target - goal.current_amount)
  const pct = target > 0 ? Math.min(100, (goal.current_amount / target) * 100) : 0

  let monthsLeft: number | null = null
  if (goal.target_date) {
    const target_ = new Date(goal.target_date)
    if (!Number.isNaN(target_.getTime())) {
      const now = new Date()
      const months = (target_.getFullYear() - now.getFullYear()) * 12 + (target_.getMonth() - now.getMonth())
      monthsLeft = months > 0 ? months : null
    }
  }

  const strategyMonthly = goal.ai_strategy?.monthly_contribution_needed ?? null
  const monthlyNeeded = strategyMonthly ?? (monthsLeft ? Math.ceil(left / monthsLeft) : null)

  return {
    pct,
    left,
    monthsLeft,
    monthlyNeeded,
    fromStrategy: strategyMonthly != null,
    done: left === 0 && target > 0,
  }
}

/** Когда цель закроется, если откладывать `perMonth` — для подсказки в форме без целевой даты. */
export function forecastGoalDate(goal: Goal, perMonth: number): Date | null {
  if (perMonth <= 0) return null
  const { left } = goalMath(goal)
  if (left === 0) return new Date()
  const months = Math.ceil(left / perMonth)
  if (!Number.isFinite(months) || months > 600) return null
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date
}

export function monthLabel(iso: string | Date) {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)
}
