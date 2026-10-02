import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_SETTINGS, type BudgetInput } from './budget'
import { annuityPayment, newDebtImpact } from './debt-check'

const TODAY = new Date(2026, 9, 15)
const HISTORY = ['2026-07-03', '2026-08-03', '2026-09-03'].map((spent_at, i) => ({ id: `h${i}`, amount: 450_000, spent_at, is_confirmed: true, category_id: null }))

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [600_000],
    incomes: [],
    expenses: HISTORY,
    debts: [{ id: 'card', title: 'Карта', status: 'active', minimum_payment: 20_000, current_balance: 400_000, interest_rate: 30 }],
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

describe('annuityPayment', () => {
  it('без процентов — просто цена на срок', () => {
    expect(annuityPayment(120_000, 12, 0)).toBe(10_000)
  })
  it('с процентами платёж выше и переплата положительная', () => {
    const p = annuityPayment(120_000, 12, 24)
    expect(p).toBeGreaterThan(10_000)
    expect(p * 12 - 120_000).toBeGreaterThan(0)
  })
  it('нулевая цена или срок — нулевой платёж', () => {
    expect(annuityPayment(0, 12, 10)).toBe(0)
    expect(annuityPayment(100_000, 0, 10)).toBe(0)
  })
})

describe('newDebtImpact', () => {
  const debt = { title: 'Ноутбук', price: 360_000, termMonths: 12, ratePct: 0 }

  it('новый долг сдвигает дату свободы и уменьшает свободные деньги', () => {
    const i = newDebtImpact(input(), debt, 600_000)
    expect(i.monthlyPayment).toBe(30_000)
    expect(i.freeMonthly.after).toBe(i.freeMonthly.before - 30_000)
    expect(i.shiftMonths).toBeGreaterThan(0)
    expect(i.debtFree.after! > i.debtFree.before!).toBe(true)
    expect(i.overpay).toBe(0)
  })

  it('«часы работы»: цена / (доход / 168)', () => {
    expect(newDebtImpact(input(), debt, 168_000).workHours).toBe(360)
  })

  it('доход не указан — часов нет', () => {
    expect(newDebtImpact(input(), debt, null).workHours).toBeNull()
    expect(newDebtImpact(input(), debt, 0).workHours).toBeNull()
  })

  it('нет других долгов: даты «до» нет, сдвига нет, дата «после» есть', () => {
    const i = newDebtImpact(input({ debts: [] }), debt, 600_000)
    expect(i.debtFree.before).toBeNull()
    expect(i.shiftMonths).toBeNull()
    expect(i.debtFree.after).not.toBeNull()
  })

  it('нулевой доход: расчёт не падает', () => {
    const i = newDebtImpact(input({ userIncomes: [0] }), debt, null)
    expect(Number.isFinite(i.freeMonthly.after)).toBe(true)
  })

  it('ставка по умолчанию 0 — переплаты нет; со ставкой — есть', () => {
    expect(newDebtImpact(input(), { ...debt, ratePct: 0 }, 600_000).overpay).toBe(0)
    expect(newDebtImpact(input(), { ...debt, ratePct: 30 }, 600_000).overpay).toBeGreaterThan(0)
  })

  it('период с 10-го числа не ломает расчёт', () => {
    const i = newDebtImpact(input({ settings: { ...DEFAULT_PLAN_SETTINGS, periodStartDay: 10 } }), debt, 600_000)
    expect(i.shiftMonths).toBeGreaterThanOrEqual(0)
  })
})
