import { budgetPeriod, computeBudget, type BudgetInput } from '@/lib/budget'
import { merchantKey } from '@/lib/merchant'

/**
 * Прогноз конца бюджетного месяца (02). Траты делятся на два рода:
 *  - обязательные (повторяющиеся: аренда, связь, подписки) — учитываются по
 *    датам, когда они обычно списываются;
 *  - переменные (еда, такси, всё остальное) — по темпу, и режим решает, по какому:
 *      cautious   — по худшей неделе периода;
 *      normal     — по среднему темпу;
 *      optimistic — по медиане дней (обычный день, без пиков).
 * Период берётся из настроек (календарный или от дня зарплаты), как везде в бюджете.
 */

export type ForecastMode = 'cautious' | 'normal' | 'optimistic'

export interface FixedItem {
  /** День бюджетного месяца (с 1), когда обычно списывается. */
  day: number
  amount: number
  label: string
}

export interface ForecastPoint {
  day: number
  /** Накопленные траты: факт до сегодня. */
  fact: number | null
  /** Накопленные траты: прогноз от сегодня до конца периода (начинается в точке факта). */
  forecast: number | null
}

export interface Forecast {
  mode: ForecastMode
  periodStart: string
  periodEnd: string
  days: number
  dayOfPeriod: number
  daysLeft: number
  /** Бюджет на траты в периоде (income − обязательства); без дохода он отрицательный или нулевой. */
  limit: number
  hasIncome: boolean
  spent: number
  /** Сколько ещё спишется по датам (регулярные платежи, которых в периоде пока не было). */
  fixedFuture: FixedItem[]
  /** Переменный темп в день, по которому считается остаток периода. */
  dailyPace: number
  projectedSpent: number
  /** Что останется к концу периода: limit − projectedSpent; меньше нуля — выход за бюджет. */
  endAvailable: number
  /** Сколько тратить в день (с сегодняшнего), чтобы закончить период в ноль; 0 — уже не получится. */
  perDayToZero: number
  /** Главная категория перебора против обычного, если есть. */
  topOverspend: { name: string; over: number } | null
  series: ForecastPoint[]
}

const DAY_MS = 86_400_000

function dayIndex(iso: string, periodStart: string, days: number): number {
  const a = Date.UTC(Number(periodStart.slice(0, 4)), Number(periodStart.slice(5, 7)) - 1, Number(periodStart.slice(8, 10)))
  const b = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.min(days, Math.max(1, Math.round((b - a) / DAY_MS) + 1))
}

function median(values: number[]) {
  if (!values.length) return 0
  const s = [...values].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

interface Spend {
  key: string
  label: string
  amount: number
  day: number
}

/** Повторяющиеся траты: магазин/получатель в ≥2 из 3 прошлых периодов, по 1–2 списания, примерно на одну сумму. */
function recurringKeys(input: BudgetInput, today: Date, startDay: number | null) {
  const periods = [1, 2, 3].map((back) => budgetPeriod(today, startDay, back))
  const perPeriod = periods.map((p) => {
    const byKey = new Map<string, Spend[]>()
    for (const e of input.expenses) {
      if (!e.is_confirmed) continue
      const day = e.spent_at.slice(0, 10)
      if (day < p.start || day > p.end) continue
      const label = e.merchant || e.description || ''
      const key = merchantKey(label)
      if (!key) continue
      byKey.set(key, [...(byKey.get(key) ?? []), { key, label, amount: e.amount, day: dayIndex(day, p.start, p.days) }])
    }
    return byKey
  })

  const out = new Map<string, { amount: number; day: number; label: string }>()
  const keys = new Set(perPeriod.flatMap((m) => [...m.keys()]))
  for (const key of keys) {
    const rows = perPeriod.map((m) => m.get(key)).filter((r): r is Spend[] => !!r)
    if (rows.length < 2 || rows.some((r) => r.length > 2)) continue
    const totals = rows.map((r) => r.reduce((s, x) => s + x.amount, 0))
    if (Math.max(...totals) > Math.min(...totals) * 1.3) continue
    out.set(key, { amount: median(totals), day: Math.round(median(rows.map((r) => Math.min(...r.map((x) => x.day))))), label: rows[0][0].label })
  }
  return out
}

export function forecast(input: BudgetInput, mode: ForecastMode): Forecast {
  const today = input.today ?? new Date()
  const b = computeBudget(input)
  const startDay = input.settings.periodStartDay ?? null
  const days = b.daysInMonth
  const dayOfPeriod = b.dayOfMonth
  const recurring = recurringKeys(input, today, startDay)

  // Траты этого периода: переменные по дням, регулярные — отдельно (чтобы не раздувать темп).
  const variableByDay = new Array<number>(days + 1).fill(0)
  const seenFixed = new Set<string>()
  for (const e of input.expenses) {
    if (!e.is_confirmed) continue
    const day = e.spent_at.slice(0, 10)
    if (day < b.periodStart || day > b.periodEnd) continue
    const key = merchantKey(e.merchant || e.description || '')
    const d = dayIndex(day, b.periodStart, days)
    if (key && recurring.has(key)) {
      seenFixed.add(key)
    } else variableByDay[d] += e.amount
  }

  const fixedFuture: FixedItem[] = [...recurring.entries()]
    .filter(([key, r]) => !seenFixed.has(key) && r.day <= days)
    .map(([, r]) => ({ day: Math.max(r.day, Math.min(days, dayOfPeriod + 1)), amount: r.amount, label: r.label }))
    .filter((f) => f.day > dayOfPeriod)
    .sort((x, y) => x.day - y.day)

  const elapsed = variableByDay.slice(1, dayOfPeriod + 1)
  const variableSoFar = elapsed.reduce((s, x) => s + x, 0)
  const mean = dayOfPeriod > 0 ? variableSoFar / dayOfPeriod : 0
  let dailyPace = mean
  if (mode === 'cautious') {
    const w = Math.min(7, dayOfPeriod)
    let worst = 0
    for (let end = w; end <= elapsed.length; end++) {
      worst = Math.max(worst, elapsed.slice(end - w, end).reduce((s, x) => s + x, 0) / w)
    }
    dailyPace = Math.max(mean, worst)
  } else if (mode === 'optimistic') {
    dailyPace = Math.min(mean, median(elapsed))
  }

  const remainingDays = Math.max(0, days - dayOfPeriod)
  const fixedFutureTotal = fixedFuture.reduce((s, f) => s + f.amount, 0)
  const projectedSpent = b.spent + dailyPace * remainingDays + fixedFutureTotal
  const endAvailable = b.limit - projectedSpent

  // График: накопленные траты. Факт — по всем подтверждённым тратам периода; прогноз
  // стартует из сегодняшней точки факта и добавляет темп и регулярные платежи по датам.
  const factByDay = new Array<number>(days + 1).fill(0)
  for (const e of input.expenses) {
    if (!e.is_confirmed) continue
    const day = e.spent_at.slice(0, 10)
    if (day < b.periodStart || day > b.periodEnd) continue
    factByDay[dayIndex(day, b.periodStart, days)] += e.amount
  }
  const series: ForecastPoint[] = []
  let cum = 0
  for (let d = 1; d <= days; d++) {
    if (d <= dayOfPeriod) {
      cum += factByDay[d]
      series.push({ day: d, fact: cum, forecast: d === dayOfPeriod ? cum : null })
    } else {
      cum += dailyPace + fixedFuture.filter((f) => f.day === d).reduce((x, f) => x + f.amount, 0)
      series.push({ day: d, fact: null, forecast: cum })
    }
  }

  const budgetLeft = b.limit - b.spent - fixedFutureTotal
  const perDayToZero = budgetLeft > 0 && b.daysLeft > 0 ? Math.floor(budgetLeft / b.daysLeft / 10) * 10 : 0

  const over = b.signals.find((s) => s.kind === 'category')
  const topOverspend = over && over.kind === 'category' ? { name: input.categoryNames[over.categoryId] ?? 'Без категории', over: over.amount } : null

  return {
    mode,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    days,
    dayOfPeriod,
    daysLeft: b.daysLeft,
    limit: b.limit,
    hasIncome: b.hasIncome,
    spent: b.spent,
    fixedFuture,
    dailyPace,
    projectedSpent,
    endAvailable,
    perDayToZero,
    topOverspend,
    series,
  }
}
