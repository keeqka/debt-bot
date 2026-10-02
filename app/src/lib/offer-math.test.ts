import { describe, expect, it } from 'vitest'
import { effectiveRatePct, totalOverpay } from './offer-math'

// 100 000 на 12 месяцев под 2% в месяц: платёж 9 455.96, годовая эффективная ≈ 26.8%
const BASE = { amount: 100_000, termMonths: 12, monthlyPayment: 9_455.96 }

describe('effectiveRatePct', () => {
  it('находит ставку по платежам', () => {
    expect(effectiveRatePct(BASE)).toBeCloseTo(26.8, 0)
  })
  it('комиссия за выдачу делает ставку выше', () => {
    expect(effectiveRatePct({ ...BASE, upfrontFees: 5_000 })!).toBeGreaterThan(effectiveRatePct(BASE)!)
  })
  it('страховка делает ставку выше', () => {
    expect(effectiveRatePct({ ...BASE, monthlyExtras: 500 })!).toBeGreaterThan(effectiveRatePct(BASE)!)
  })
  it('рассрочка без процентов — нулевая ставка', () => {
    expect(effectiveRatePct({ amount: 120_000, termMonths: 12, monthlyPayment: 10_000 })).toBe(0)
  })
  it('платежи меньше суммы или нулевые данные — ставки нет', () => {
    expect(effectiveRatePct({ amount: 120_000, termMonths: 12, monthlyPayment: 5_000 })).toBeNull()
    expect(effectiveRatePct({ amount: 0, termMonths: 12, monthlyPayment: 1_000 })).toBeNull()
    expect(effectiveRatePct({ amount: 100_000, termMonths: 0, monthlyPayment: 1_000 })).toBeNull()
  })
})

describe('totalOverpay', () => {
  it('платежи плюс страховка плюс комиссии минус сумма', () => {
    expect(totalOverpay({ ...BASE, upfrontFees: 2_000, monthlyExtras: 100 })).toBe(Math.round(9_455.96 * 12 + 100 * 12 + 2_000 - 100_000))
  })
  it('не отрицательная', () => {
    expect(totalOverpay({ amount: 100_000, termMonths: 5, monthlyPayment: 10_000 })).toBe(0)
  })
})
