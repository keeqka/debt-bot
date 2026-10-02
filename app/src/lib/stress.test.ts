import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_SETTINGS, type BudgetInput } from './budget'
import { stressTest } from './stress'

const TODAY = new Date(2026, 9, 15)
const e = (id: string, spent_at: string, amount: number, category_id: string | null) => ({ id, amount, spent_at, is_confirmed: true, category_id })

// Три прошлых месяца: нужное — жильё 200 000, еда 100 000; желания — кафе 60 000, кино 20 000, одежда 40 000, игры 10 000
const MONTHS = ['2026-07-05', '2026-08-05', '2026-09-05']
const HISTORY = MONTHS.flatMap((d, i) => [
  e(`h${i}`, d, 200_000, 'home'),
  e(`f${i}`, d, 100_000, 'food'),
  e(`c${i}`, d, 60_000, 'cafe'),
  e(`k${i}`, d, 20_000, 'cinema'),
  e(`o${i}`, d, 40_000, 'clothes'),
  e(`g${i}`, d, 10_000, 'games'),
])

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [500_000],
    incomes: [],
    expenses: HISTORY,
    debts: [{ id: 'd', title: 'Кредит', status: 'active', minimum_payment: 40_000, current_balance: 600_000, interest_rate: 20 }],
    debtPayments: [],
    hasActiveGoals: false,
    cushionBalance: 1_000_000,
    settings: DEFAULT_PLAN_SETTINGS,
    categoryNames: { home: 'Жильё', food: 'Еда', cafe: 'Кафе', cinema: 'Кино', clothes: 'Одежда', games: 'Игры' },
    categoryNeedKinds: { home: 'need', food: 'need', cafe: 'want', cinema: 'want', clothes: 'want', games: 'want' },
    currencySymbol: '₸',
    today: TODAY,
    ...over,
  }
}

describe('stressTest', () => {
  it('потеря работы: доход 0, подушка делится на обычные траты + платежи', () => {
    const r = stressTest(input(), 'job_loss')
    expect(r.income).toBe(0)
    expect(r.burn).toBe(430_000 + 40_000)
    expect(r.coverMonths).toBeCloseTo(1_000_000 / 470_000, 1)
  })

  it('доход −30%', () => {
    const r = stressTest(input(), 'income_minus_30')
    expect(r.income).toBe(350_000)
    expect(r.burn).toBe(430_000 + 40_000 - 350_000)
    expect(r.coverMonths).toBeCloseTo(1_000_000 / 120_000, 1)
  })

  it('ставка +5 п.п. добавляет проценты на остаток к платежам', () => {
    const base = stressTest(input(), 'rate_plus_5')
    expect(base.payments).toBeCloseTo(40_000 + (600_000 * 0.05) / 12, 5)
    // доход тот же 500 000, платежи на 2 500 выше, чем без шока
    expect(base.burn).toBeCloseTo(430_000 + 42_500 - 500_000, 5)
    expect(base.burn).toBeGreaterThan(stressTest(input(), 'custom', 500_000).burn)
  })

  it('«Свой» доход', () => {
    const r = stressTest(input(), 'custom', 300_000)
    expect(r.income).toBe(300_000)
    expect(r.burn).toBe(430_000 + 40_000 - 300_000)
  })

  it('доход покрывает всё — подушка не тратится', () => {
    const r = stressTest(input({ userIncomes: [900_000] }), 'custom', 900_000)
    expect(r.burn).toBeLessThan(0)
    expect(r.coverMonths).toBeNull()
  })

  it('подушки нет — хватит на 0 месяцев', () => {
    const r = stressTest(input({ cushionBalance: 0 }), 'job_loss')
    expect(r.coverMonths).toBe(0)
  })

  it('нет долгов: платежей нет, ставка не влияет', () => {
    const r = stressTest(input({ debts: [] }), 'rate_plus_5')
    expect(r.payments).toBe(0)
  })

  it('«Режем первыми»: топ-3 необязательных по средней сумме и срок после урезки', () => {
    const r = stressTest(input(), 'job_loss')
    expect(r.cuts.map((c) => c.name)).toEqual(['Кафе', 'Одежда', 'Кино'])
    expect(r.cuts.map((c) => c.avg)).toEqual([60_000, 40_000, 20_000])
    expect(r.burnAfterCuts).toBe(r.burn - 120_000)
    expect(r.monthsAfterCuts!).toBeGreaterThan(r.coverMonths!)
  })

  it('нет необязательных категорий — урезать нечего, срок тот же', () => {
    const r = stressTest(input({ categoryNeedKinds: {} }), 'job_loss')
    expect(r.cuts).toEqual([])
    expect(r.monthsAfterCuts).toBe(r.coverMonths)
  })

  it('нулевой доход в настройках: расчёт не падает', () => {
    const r = stressTest(input({ userIncomes: [0] }), 'income_minus_30')
    expect(r.income).toBe(0)
    expect(Number.isFinite(r.burn)).toBe(true)
  })

  it('период с 10-го числа: траты 5-го числа попадают в предыдущий период и тоже считаются', () => {
    const r = stressTest(input({ settings: { ...DEFAULT_PLAN_SETTINGS, periodStartDay: 10 } }), 'job_loss')
    expect(r.cuts.length).toBeGreaterThan(0)
  })
})
