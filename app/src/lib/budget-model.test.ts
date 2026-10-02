import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_SETTINGS, computeBudget, type BudgetInput } from './budget'
import { assessMonth } from './budget-model'

const TODAY = new Date(2026, 9, 15)
const e = (id: string, spent_at: string, amount: number, category_id: string | null) => ({ id, amount, spent_at, is_confirmed: true, category_id })
const PAST = ['2026-07-03', '2026-08-03', '2026-09-03']

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [1_000_000],
    incomes: [],
    expenses: [
      // обычный месяц: жильё 300 000, еда 100 000, развлечения 200 000
      ...PAST.flatMap((d, i) => [e(`h${i}`, d, 300_000, 'home'), e(`f${i}`, d, 100_000, 'food'), e(`w${i}`, d, 200_000, 'fun')]),
      // этот месяц
      e('t1', '2026-10-03', 200_000, 'home'),
      e('t2', '2026-10-04', 60_000, 'food'),
      e('t3', '2026-10-05', 120_000, 'fun'),
    ],
    debts: [{ id: 'd', title: 'Кредит', status: 'active', minimum_payment: 50_000, current_balance: 800_000, interest_rate: 20 }],
    debtPayments: [],
    hasActiveGoals: false,
    cushionBalance: 0,
    settings: DEFAULT_PLAN_SETTINGS,
    categoryNames: { home: 'Жильё', food: 'Еда', fun: 'Развлечения' },
    categoryNeedKinds: { home: 'need', food: 'need', fun: 'want' },
    currencySymbol: '₸',
    today: TODAY,
    ...over,
  }
}

describe('assessMonth', () => {
  it('50/30/20: считает доли нужного, желаний и откладывания', () => {
    const a = assessMonth(input(), '50_30_20')
    expect(a.hasIncome).toBe(true)
    // нужное: (200 000 + 60 000 + платежи 50 000) / 1 000 000 = 31%; желания 12%
    expect(a.rows[0].value).toBe('31%')
    expect(a.rows[1].value).toBe('12%')
    expect(a.rows[0].state).toBe('ok')
    expect(a.rows[2].label).toContain('Откладываю')
  })

  it('50/30/20: перекос в желания помечается', () => {
    const wants = assessMonth(input({ expenses: [...input().expenses, e('x', '2026-10-06', 400_000, 'fun')] }), '50_30_20')
    expect(wants.rows[1].state).toBe('warn')
    expect(wants.headline).toContain('желания')
  })

  it('«Каждый тенге назначен»: не назначено = то, что осталось в бюджете', () => {
    const i = input()
    const b = computeBudget(i)
    const a = assessMonth(i, 'zero_based')
    expect(a.rows).toHaveLength(2)
    expect(a.headline.length).toBeGreaterThan(0)
    // назначено = траты + обязательства месяца
    expect(a.rows[0].value.replace(/\s/g, '').replace(/ /g, '')).toContain(String(Math.round(b.spent + b.obligations)))
  })

  it('«Сначала себе»: доля дохода, уходящая в долги, подушку и цели', () => {
    const a = assessMonth(input(), 'pay_yourself_first')
    expect(a.rows[1].label).toBe('Доля дохода')
    expect(a.rows[1].target).toBe('от 20%')
  })

  it('индекс свободы: обязательные / доход и главный вес', () => {
    const a = assessMonth(input(), '50_30_20')
    // обычные нужные: жильё 300 000 + еда 100 000 + платежи 50 000 = 450 000 → 45%
    expect(a.freedomIndex).toBeCloseTo(0.45, 2)
    expect(a.freedomMain).toBe('Жильё')
  })

  it('категория без пометки считается нужным', () => {
    const a = assessMonth(input({ categoryNeedKinds: { home: 'need', food: 'need' } }), '50_30_20')
    // развлечения без пометки → нужное; желаний нет
    expect(a.rows[1].value).toBe('0%')
  })

  it('нулевой доход: оценки нет, подсказка', () => {
    const a = assessMonth(input({ userIncomes: [0] }), '50_30_20')
    expect(a.hasIncome).toBe(false)
    expect(a.rows).toEqual([])
    expect(a.freedomIndex).toBeNull()
  })

  it('нет долгов и нет категорий — не падает', () => {
    const a = assessMonth(input({ debts: [], expenses: [] }), '50_30_20')
    expect(a.freedomMain).toBeNull()
    expect(a.freedomIndex).toBe(0)
  })

  it('период с 10-го числа не ломает оценку', () => {
    const a = assessMonth(input({ settings: { ...DEFAULT_PLAN_SETTINGS, periodStartDay: 10 } }), 'zero_based')
    expect(a.hasIncome).toBe(true)
  })

  it('модель не меняет «можно тратить»', () => {
    const b = computeBudget(input())
    assessMonth(input(), 'zero_based')
    expect(computeBudget(input()).available).toBe(b.available)
  })
})
