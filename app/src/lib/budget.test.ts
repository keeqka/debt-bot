import { describe, expect, it } from 'vitest'
import { computeBudget, DEFAULT_PLAN_SETTINGS, type BudgetInput } from './budget'

const TODAY = new Date(2026, 9, 15) // 15 октября 2026
const HISTORY = ['2026-07-03', '2026-08-03', '2026-09-03'].map((spent_at, i) => ({ id: `h${i}`, amount: 400_000, spent_at, is_confirmed: true, category_id: null }))

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [600_000],
    incomes: [],
    expenses: HISTORY,
    debts: [{ id: 'd', title: 'Кредит', status: 'active', minimum_payment: 30_000, current_balance: 500_000, interest_rate: 20 }],
    debtPayments: [],
    hasActiveGoals: false,
    cushionBalance: 0,
    settings: DEFAULT_PLAN_SETTINGS,
    categoryNames: {},
    currencySymbol: '₸',
    today: TODAY,
    ...over,
  }
}

describe('annual reserve', () => {
  it('без крупных трат резерва нет', () => {
    expect(computeBudget(input()).annualReserve).toBe(0)
  })

  it('резерв = (сумма − отложено) / месяцев до срока', () => {
    // в октябре; срок — январь: 3 месяца; 120 000 − 30 000 = 90 000 → 30 000 в месяц
    const b = computeBudget(input({ annualExpenses: [{ amount: 120_000, saved: 30_000, month: 1 }] }))
    expect(b.annualReserve).toBe(30_000)
  })

  it('резерв берётся из денег «сверх минимумов»: план меняется, а лимит на траты — нет', () => {
    const base = computeBudget(input())
    const withReserve = computeBudget(input({ annualExpenses: [{ amount: 120_000, saved: 0, month: 1 }] }))
    expect(withReserve.freeMonthly).toBe(base.freeMonthly - 40_000)
    expect(withReserve.planExtra).toBeLessThan(base.planExtra)
    // меньше денег идёт в долги → они закроются позже
    expect(withReserve.plan.debtFreeDate! >= base.plan.debtFreeDate!).toBe(true)
    // резерв — часть обязательств месяца, но «можно тратить» не меняется: его оплачивают долги, а не траты
    expect(withReserve.obligations).toBe(base.obligations)
    expect(withReserve.limit).toBe(base.limit)
  })

  it('срок в этом же месяце — откладывать всё сразу', () => {
    expect(computeBudget(input({ annualExpenses: [{ amount: 50_000, saved: 10_000, month: 10 }] })).annualReserve).toBe(40_000)
  })

  it('срок в прошедшем месяце года переносится на следующий год', () => {
    // июнь при октябре: 8 месяцев
    expect(computeBudget(input({ annualExpenses: [{ amount: 80_000, saved: 0, month: 6 }] })).annualReserve).toBe(10_000)
  })

  it('уже отложено больше суммы — резерв не отрицательный', () => {
    expect(computeBudget(input({ annualExpenses: [{ amount: 50_000, saved: 80_000, month: 12 }] })).annualReserve).toBe(0)
  })

  it('нулевой доход: расчёт не падает', () => {
    const b = computeBudget(input({ userIncomes: [0], annualExpenses: [{ amount: 60_000, saved: 0, month: 12 }] }))
    expect(Number.isFinite(b.limit)).toBe(true)
    // декабрь при октябре — 2 месяца: 60 000 / 2
    expect(b.annualReserve).toBe(30_000)
  })
})
