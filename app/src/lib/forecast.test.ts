import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_SETTINGS, type BudgetInput } from './budget'
import { forecast } from './forecast'

const expense = (id: string, spent_at: string, amount: number, merchant: string | null = null) => ({
  id,
  amount,
  spent_at,
  is_confirmed: true,
  category_id: null,
  merchant,
})

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [600_000],
    incomes: [],
    expenses: [],
    debts: [],
    debtPayments: [],
    hasActiveGoals: false,
    cushionBalance: 0,
    settings: DEFAULT_PLAN_SETTINGS,
    categoryNames: {},
    currencySymbol: '₸',
    today: new Date(2026, 9, 11), // 11 октября: день 11 из 31
    ...over,
  }
}

describe('forecast', () => {
  it('без трат прогноз пустой, график идёт по всему периоду', () => {
    const f = forecast(input(), 'normal')
    expect(f.projectedSpent).toBe(0)
    expect(f.series).toHaveLength(31)
    expect(f.series[0].fact).toBe(0)
    expect(f.series[30].forecast).toBe(0)
    expect(f.fixedFuture).toEqual([])
  })

  it('средний темп: траты по 10 000 в день → к концу периода 310 000', () => {
    const expenses = Array.from({ length: 11 }, (_, i) => expense(`e${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`, 10_000))
    const f = forecast(input({ expenses }), 'normal')
    expect(f.dailyPace).toBeCloseTo(10_000, 5)
    expect(f.projectedSpent).toBeCloseTo(310_000, 0)
    expect(f.series[10].fact).toBe(110_000)
    expect(f.series[10].forecast).toBe(110_000)
    expect(f.series[30].forecast).toBeCloseTo(310_000, 0)
  })

  it('режимы по возрастанию осторожности: оптимистичный ≤ обычный ≤ осторожный', () => {
    // одна крупная трата на неделе — тянет среднее вверх, медиана дней низкая
    const expenses = [
      expense('a', '2026-10-02', 5_000),
      expense('b', '2026-10-03', 5_000),
      expense('c', '2026-10-04', 90_000),
      expense('d', '2026-10-09', 5_000),
      expense('e', '2026-10-10', 5_000),
    ]
    const o = forecast(input({ expenses }), 'optimistic')
    const n = forecast(input({ expenses }), 'normal')
    const c = forecast(input({ expenses }), 'cautious')
    expect(o.projectedSpent).toBeLessThanOrEqual(n.projectedSpent)
    expect(n.projectedSpent).toBeLessThanOrEqual(c.projectedSpent)
    expect(c.projectedSpent).toBeGreaterThan(o.projectedSpent)
  })

  it('регулярная трата учитывается по дате, а не по темпу', () => {
    // Аренда 150 000 каждого 20-го числа в трёх прошлых месяцах; сегодня 11-е
    const expenses = [
      expense('r1', '2026-07-20', 150_000, 'Аренда квартиры'),
      expense('r2', '2026-08-20', 150_000, 'Аренда квартиры'),
      expense('r3', '2026-09-20', 150_000, 'Аренда квартиры'),
      expense('v1', '2026-10-05', 20_000, 'Magnum'),
    ]
    const f = forecast(input({ expenses }), 'normal')
    expect(f.fixedFuture).toHaveLength(1)
    expect(f.fixedFuture[0]).toMatchObject({ day: 20, amount: 150_000 })
    // темп считается только по переменным: 20 000 за 11 дней
    expect(f.dailyPace).toBeCloseTo(20_000 / 11, 5)
    expect(f.projectedSpent).toBeCloseTo(20_000 + (20_000 / 11) * 20 + 150_000, 0)
    // регулярная трата видна на графике скачком 20-го
    expect(f.series[19].forecast! - f.series[18].forecast!).toBeGreaterThan(150_000)
  })

  it('регулярная трата, которая уже была в этом периоде, не дублируется', () => {
    const expenses = [
      expense('r1', '2026-08-05', 150_000, 'Аренда квартиры'),
      expense('r2', '2026-09-05', 150_000, 'Аренда квартиры'),
      expense('r3', '2026-10-05', 150_000, 'Аренда квартиры'),
    ]
    const f = forecast(input({ expenses }), 'normal')
    expect(f.fixedFuture).toEqual([])
    expect(f.dailyPace).toBe(0)
  })

  it('частые покупки в одном магазине — не регулярные платежи, а темп', () => {
    const expenses = ['06', '07', '08'].flatMap((m) => ['03', '10', '17', '24'].map((d) => expense(`${m}${d}`, `2026-${m}-${d}`, 8_000, 'Magnum')))
    expect(forecast(input({ expenses }), 'normal').fixedFuture).toEqual([])
  })

  it('нулевой доход: бюджета нет, прогноз не падает', () => {
    const f = forecast(input({ userIncomes: [0], expenses: [expense('a', '2026-10-02', 50_000)] }), 'normal')
    expect(f.hasIncome).toBe(false)
    expect(Number.isFinite(f.endAvailable)).toBe(true)
    expect(f.perDayToZero).toBe(0)
  })

  it('период с 10-го числа: сегодня 11-е — второй день периода, он идёт с 10 октября по 9 ноября', () => {
    const f = forecast(input({ settings: { ...DEFAULT_PLAN_SETTINGS, periodStartDay: 10 } }), 'normal')
    expect(f.periodStart).toBe('2026-10-10')
    expect(f.periodEnd).toBe('2026-11-09')
    expect(f.dayOfPeriod).toBe(2)
    expect(f.days).toBe(31)
    expect(f.series).toHaveLength(31)
  })

  it('перерасход: остаток к концу периода отрицательный', () => {
    const expenses = Array.from({ length: 11 }, (_, i) => expense(`e${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`, 30_000))
    const f = forecast(input({ expenses }), 'normal')
    expect(f.endAvailable).toBeLessThan(0)
    // чтобы выйти в ноль, нужно тратить заметно меньше текущих 30 000 в день
    expect(f.perDayToZero).toBeGreaterThan(0)
    expect(f.perDayToZero).toBeLessThan(f.dailyPace)
  })
})
