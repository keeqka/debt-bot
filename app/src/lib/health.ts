import { annualMonthsLeft, budgetPeriod } from '@/lib/budget'
import type { HealthItemId } from '@/types/domain'

/**
 * Финансовое здоровье (11): чек-лист из семи пунктов, вычисляется из данных.
 * Пункт можно отметить «не про меня» — он выпадает из знаменателя («4/6», а не
 * «4/7»). Страховка — ручной пункт: данных о ней в приложении нет.
 */

export interface HealthInput {
  today: Date
  periodStartDay: number | null
  /** Даты подтверждённых трат. */
  expenseDates: string[]
  cushionBalance: number
  /** Обычный месяц: обычные траты + платежи по долгам (Budget.monthlyNeed). */
  monthlyNeed: number
  /** Цель подушки из настроек, месяцев. */
  cushionMonths: number
  /** Ставка, с которой долг считается дорогим (настройки). */
  highRateThreshold: number
  debts: Array<{
    id: string
    title: string
    interest_rate: number | null
    current_balance: number
    due_day: number | null
    created_at: string
    status: 'active' | 'closed'
  }>
  payments: Array<{ debt_id: string; paid_at: string }>
  annual: Array<{ title: string; amount: number; saved: number; month: number }>
  overrides: Array<{ item: HealthItemId; status: 'na' | 'done' }>
}

export interface HealthItem {
  id: HealthItemId
  title: string
  state: 'done' | 'todo' | 'na'
  /** Насколько близко к выполнению, 0…1 (у выполненных — 1). */
  progress: number
  detail: string
  action: { label: string; to: string } | null
  /** Отмечается вручную (страховка). */
  manual: boolean
}

export interface HealthResult {
  items: HealthItem[]
  done: number
  /** Сколько пунктов считаются (без «не про меня»). */
  total: number
  /** Ближайший к выполнению невыполненный пункт — про него реплика маскота. */
  next: HealthItem | null
}

const TITLES: Record<HealthItemId, string> = {
  budget_history: 'Бюджет ведётся 2 месяца и больше',
  cushion_1: 'Подушка на 1 месяц',
  no_overdue: 'Нет просрочек 6 месяцев',
  no_expensive_debt: 'Нет дорогих долгов',
  cushion_target: 'Подушка на целевой срок',
  annual_reserve: 'Крупные траты года в резерве',
  insurance: 'Есть страховка',
}

const ORDER = Object.keys(TITLES) as HealthItemId[]
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₸`
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Месяцы (календарные) за последние 6, в которых по долгу с датой платежа не было ни одного платежа. */
function overdueMonths(h: HealthInput) {
  const misses: Array<{ debt: string; month: string }> = []
  const y = h.today.getFullYear()
  const m = h.today.getMonth()
  for (let back = 0; back <= 6; back++) {
    const idx = y * 12 + m - back
    const yy = Math.floor(idx / 12)
    const mm = idx % 12
    const start = iso(yy, mm, 1)
    const end = iso(yy, mm, new Date(yy, mm + 1, 0).getDate())
    for (const d of h.debts) {
      if (d.due_day == null) continue
      // Текущий месяц — только если срок уже прошёл; долг должен был существовать весь месяц.
      if (back === 0 && h.today.getDate() <= d.due_day) continue
      if (d.created_at.slice(0, 10) > start) continue
      if (d.status === 'closed' && d.current_balance > 0) continue
      const paid = h.payments.some((p) => p.debt_id === d.id && p.paid_at.slice(0, 10) >= start && p.paid_at.slice(0, 10) <= end)
      if (!paid && !(d.status === 'closed')) misses.push({ debt: d.title, month: `${MONTH_NAMES[mm]}` })
    }
  }
  return misses
}

export function evaluateHealth(h: HealthInput): HealthResult {
  const override = new Map(h.overrides.map((o) => [o.item, o.status]))
  const active = h.debts.filter((d) => d.status === 'active' && d.current_balance > 0)

  // 1. бюджет ведётся 2+ месяца: сколько бюджетных месяцев содержат траты
  const periods = new Set<number>()
  for (const raw of h.expenseDates) {
    const day = raw.slice(0, 10)
    for (let back = 0; back < 24; back++) {
      const p = budgetPeriod(h.today, h.periodStartDay, back)
      if (day >= p.start && day <= p.end) {
        periods.add(back)
        break
      }
      if (p.end < day) break
    }
  }
  const months = periods.size

  // 2 и 5. подушка
  const need = h.monthlyNeed
  const coverMonths = need > 0 ? h.cushionBalance / need : h.cushionBalance > 0 ? Infinity : 0
  const target = Math.max(1, h.cushionMonths)

  // 3. просрочки
  const misses = overdueMonths(h)

  // 4. дорогие долги
  const expensive = active.filter((d) => (d.interest_rate ?? 0) >= h.highRateThreshold)
  const totalDebt = active.reduce((s, d) => s + d.current_balance, 0)
  const expensiveShare = totalDebt > 0 ? expensive.reduce((s, d) => s + d.current_balance, 0) / totalDebt : 0

  // 6. крупные траты: отложено не меньше, чем положено к этому месяцу
  const annualRatios = h.annual.map((a) => {
    const expected = (a.amount * (12 - annualMonthsLeft(a.month, h.today))) / 12
    return expected <= 0 ? 1 : clamp01(a.saved / expected)
  })

  const raw: Record<HealthItemId, Omit<HealthItem, 'id' | 'title' | 'state' | 'manual'> & { done: boolean }> = {
    budget_history: {
      done: months >= 2,
      progress: clamp01(months / 2),
      detail: months >= 2 ? `Месяцев с тратами: ${months}.` : months === 1 ? 'Пока один месяц с тратами — нужен ещё один.' : 'Трат пока нет — загрузи первый чек.',
      action: { label: 'Загрузить чек', to: '/receipt' },
    },
    cushion_1: {
      done: coverMonths >= 1,
      progress: clamp01(coverMonths / 1),
      detail: need > 0 ? `Подушка покрывает ${(Math.round(Math.min(coverMonths, 99) * 10) / 10).toString().replace('.', ',')} мес из 1 (месяц — ${money(need)}).` : 'Подушки нет.',
      action: { label: 'Пополнить подушку', to: '/plan?to=goals' },
    },
    no_overdue: {
      done: misses.length === 0,
      progress: clamp01(1 - misses.length / 6),
      detail: misses.length === 0 ? 'Платежи по долгам идут без пропусков.' : `Не видно платежа по «${misses[0].debt}» за ${misses[0].month}${misses.length > 1 ? ` и ещё ${misses.length - 1}` : ''}.`,
      action: { label: 'К платежам', to: '/plan' },
    },
    no_expensive_debt: {
      done: expensive.length === 0,
      progress: clamp01(1 - expensiveShare),
      detail: expensive.length === 0 ? 'Дорогих долгов нет.' : `Ставка от ${h.highRateThreshold}%: ${expensive.map((d) => `«${d.title}»`).join(', ')}.`,
      action: { label: 'Пересчитать план', to: '/plan' },
    },
    cushion_target: {
      done: need > 0 ? coverMonths >= target : h.cushionBalance > 0,
      progress: clamp01(coverMonths / target),
      detail: need > 0 ? `Цель — ${target} мес (${money(need * target)}), есть ${money(h.cushionBalance)}.` : 'Подушки нет.',
      action: { label: 'Пополнить подушку', to: '/plan?to=goals' },
    },
    annual_reserve: {
      done: h.annual.length > 0 && annualRatios.every((r) => r >= 1),
      progress: h.annual.length === 0 ? 0 : annualRatios.reduce((s, r) => s + r, 0) / annualRatios.length,
      detail: h.annual.length === 0 ? 'Крупных трат года нет в плане — добавь страховку, отпуск, налоги.' : `Отложено по плану: ${annualRatios.filter((r) => r >= 1).length} из ${h.annual.length}.`,
      action: { label: 'Крупные траты', to: '/plan?to=goals' },
    },
    insurance: {
      done: override.get('insurance') === 'done',
      progress: override.get('insurance') === 'done' ? 1 : 0,
      detail: override.get('insurance') === 'done' ? 'Отмечено: страховка есть.' : 'Данных о страховке в приложении нет — отметь сам, когда она будет.',
      action: null,
    },
  }

  const items: HealthItem[] = ORDER.map((id) => {
    const r = raw[id]
    const isNa = override.get(id) === 'na'
    return {
      id,
      title: TITLES[id],
      state: isNa ? 'na' : r.done ? 'done' : 'todo',
      progress: r.done ? 1 : r.progress,
      detail: r.detail,
      action: r.action,
      manual: id === 'insurance',
    }
  })

  const counted = items.filter((i) => i.state !== 'na')
  const next = items.filter((i) => i.state === 'todo').sort((a, b) => b.progress - a.progress)[0] ?? null
  return { items, done: counted.filter((i) => i.state === 'done').length, total: counted.length, next }
}
