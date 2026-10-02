import { describe, expect, it } from 'vitest'
import { cardAvailable, previewDraw } from './credit-card'

const card = { current_balance: 62_000, credit_limit: 200_000, interest_rate: 24 }

describe('credit card', () => {
  it('доступно = лимит − остаток; без лимита — null', () => {
    expect(cardAvailable(card)).toBe(138_000)
    expect(cardAvailable({ ...card, credit_limit: null })).toBeNull()
    expect(cardAvailable({ ...card, current_balance: 250_000 })).toBe(0)
  })

  it('снятие поднимает остаток и считает проценты на снятую сумму', () => {
    const p = previewDraw(card, 50_000)
    expect(p.newBalance).toBe(112_000)
    expect(p.availableAfter).toBe(88_000)
    expect(p.overLimit).toBe(false)
    expect(p.monthlyInterest).toBe(1_000)
  })

  it('больше доступного — перелимит', () => {
    expect(previewDraw(card, 138_001).overLimit).toBe(true)
    expect(previewDraw(card, 138_000).overLimit).toBe(false)
  })

  it('без лимита перелимита нет; без ставки процентов нет; пустая сумма — ноль', () => {
    expect(previewDraw({ ...card, credit_limit: null }, 5_000_000).overLimit).toBe(false)
    expect(previewDraw({ ...card, interest_rate: null }, 50_000).monthlyInterest).toBe(0)
    expect(previewDraw(card, Number.NaN)).toMatchObject({ amount: 0, newBalance: 62_000, overLimit: false })
    expect(previewDraw(card, -5).amount).toBe(0)
  })
})
