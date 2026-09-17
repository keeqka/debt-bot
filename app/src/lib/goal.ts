import type { Goal } from '@/types/domain'

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
