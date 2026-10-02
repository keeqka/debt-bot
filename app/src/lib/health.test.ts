import { describe, expect, it } from 'vitest'
import { evaluateHealth, type HealthInput } from './health'

const TODAY = new Date(2026, 9, 15) // 15 октября 2026

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    today: TODAY,
    periodStartDay: null,
    expenseDates: [],
    cushionBalance: 0,
    monthlyNeed: 500_000,
    cushionMonths: 3,
    highRateThreshold: 15,
    debts: [],
    payments: [],
    annual: [],
    overrides: [],
    ...over,
  }
}

const item = (r: ReturnType<typeof evaluateHealth>, id: string) => r.items.find((i) => i.id === id)!

describe('evaluateHealth', () => {
  it('пустые данные: семь пунктов; без долгов «нет просрочек» и «нет дорогих долгов» выполнены', () => {
    const r = evaluateHealth(input())
    expect(r.items).toHaveLength(7)
    expect(r.total).toBe(7)
    expect(item(r, 'no_overdue').state).toBe('done')
    expect(item(r, 'no_expensive_debt').state).toBe('done')
    expect(r.done).toBe(2)
  })

  it('бюджет ведётся 2+ месяца: считает бюджетные месяцы с тратами', () => {
    expect(item(evaluateHealth(input({ expenseDates: ['2026-10-02'] })), 'budget_history').state).toBe('todo')
    expect(item(evaluateHealth(input({ expenseDates: ['2026-10-02'] })), 'budget_history').progress).toBe(0.5)
    expect(item(evaluateHealth(input({ expenseDates: ['2026-10-02', '2026-09-20'] })), 'budget_history').state).toBe('done')
  })

  it('период с 10-го числа: траты 5 октября и 20 сентября — разные бюджетные месяцы', () => {
    // сегодня 15 окт, период 10 окт–9 ноя; 5 окт — в предыдущем (10 сен–9 окт), 20 сен — тоже в нём
    const r = evaluateHealth(input({ periodStartDay: 10, expenseDates: ['2026-10-05', '2026-09-20'] }))
    expect(item(r, 'budget_history').state).toBe('todo')
    expect(item(evaluateHealth(input({ periodStartDay: 10, expenseDates: ['2026-10-12', '2026-10-05'] })), 'budget_history').state).toBe('done')
  })

  it('подушка на 1 месяц и на цель', () => {
    const half = evaluateHealth(input({ cushionBalance: 250_000 }))
    expect(item(half, 'cushion_1').progress).toBe(0.5)
    const two = evaluateHealth(input({ cushionBalance: 1_000_000 }))
    expect(item(two, 'cushion_1').state).toBe('done')
    expect(item(two, 'cushion_target').state).toBe('todo')
    expect(item(evaluateHealth(input({ cushionBalance: 1_500_000 })), 'cushion_target').state).toBe('done')
  })

  it('нулевой обычный месяц: подушка есть — выполнено, нет — нет', () => {
    expect(item(evaluateHealth(input({ monthlyNeed: 0, cushionBalance: 10_000 })), 'cushion_1').state).toBe('done')
    expect(item(evaluateHealth(input({ monthlyNeed: 0, cushionBalance: 0 })), 'cushion_1').state).toBe('todo')
  })

  it('просрочка: за месяц, где долг существовал, нет платежа', () => {
    const debt = { id: 'd', title: 'Кредит', interest_rate: 10, current_balance: 300_000, due_day: 5, created_at: '2026-01-01', status: 'active' as const }
    const payments = ['2026-04-05', '2026-05-05', '2026-06-05', '2026-07-05', '2026-09-05', '2026-10-05'].map((paid_at) => ({ debt_id: 'd', paid_at }))
    const r = evaluateHealth(input({ debts: [debt], payments }))
    expect(item(r, 'no_overdue').state).toBe('todo')
    expect(item(r, 'no_overdue').detail).toContain('август')
    const all = ['2026-04-05', '2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'].map((paid_at) => ({ debt_id: 'd', paid_at }))
    expect(item(evaluateHealth(input({ debts: [debt], payments: all })), 'no_overdue').state).toBe('done')
  })

  it('долг без срока платежа и новый долг не дают просрочки', () => {
    const noDay = { id: 'a', title: 'Друг', interest_rate: null, current_balance: 50_000, due_day: null, created_at: '2025-01-01', status: 'active' as const }
    const fresh = { id: 'b', title: 'Новый', interest_rate: 10, current_balance: 90_000, due_day: 5, created_at: '2026-10-10', status: 'active' as const }
    expect(item(evaluateHealth(input({ debts: [noDay, fresh] })), 'no_overdue').state).toBe('done')
  })

  it('дорогие долги: порог из настроек; долг без ставки не дорогой', () => {
    const cheap = { id: 'a', title: 'Друг', interest_rate: null, current_balance: 100_000, due_day: null, created_at: '2025-01-01', status: 'active' as const }
    const dear = { id: 'b', title: 'Карта', interest_rate: 30, current_balance: 100_000, due_day: null, created_at: '2025-01-01', status: 'active' as const }
    expect(item(evaluateHealth(input({ debts: [cheap] })), 'no_expensive_debt').state).toBe('done')
    const r = evaluateHealth(input({ debts: [cheap, dear] }))
    expect(item(r, 'no_expensive_debt').state).toBe('todo')
    expect(item(r, 'no_expensive_debt').progress).toBe(0.5)
  })

  it('крупные траты года: нет — не выполнено; отложено по плану — выполнено', () => {
    expect(item(evaluateHealth(input()), 'annual_reserve').state).toBe('todo')
    // декабрь при октябре: до срока 2 месяца → должно быть отложено 10/12 суммы
    const onTrack = evaluateHealth(input({ annual: [{ title: 'Страховка', amount: 120_000, month: 12, saved: 100_000 }] }))
    expect(item(onTrack, 'annual_reserve').state).toBe('done')
    const behind = evaluateHealth(input({ annual: [{ title: 'Страховка', amount: 120_000, month: 12, saved: 50_000 }] }))
    expect(item(behind, 'annual_reserve').state).toBe('todo')
    expect(item(behind, 'annual_reserve').progress).toBeCloseTo(0.5, 5)
  })

  it('«не про меня» выпадает из знаменателя, страховка отмечается вручную', () => {
    const r = evaluateHealth(input({ overrides: [{ item: 'insurance', status: 'na' }, { item: 'annual_reserve', status: 'na' }] }))
    expect(r.total).toBe(5)
    expect(item(r, 'insurance').state).toBe('na')
    const marked = evaluateHealth(input({ overrides: [{ item: 'insurance', status: 'done' }] }))
    expect(item(marked, 'insurance').state).toBe('done')
    expect(marked.done).toBe(3)
  })

  it('следующий пункт — ближайший к выполнению', () => {
    const r = evaluateHealth(input({ cushionBalance: 400_000, expenseDates: ['2026-10-02'] }))
    // подушка 1 мес: 0.8, бюджет: 0.5 → подушка ближе
    expect(r.next?.id).toBe('cushion_1')
    expect(r.next?.action?.to).toBe('/plan?to=goals')
  })

  it('всё выполнено — следующего нет', () => {
    const r = evaluateHealth(
      input({
        expenseDates: ['2026-10-02', '2026-09-02'],
        cushionBalance: 2_000_000,
        annual: [{ title: 'Отпуск', amount: 60_000, month: 12, saved: 60_000 }],
        overrides: [{ item: 'insurance', status: 'done' }],
      }),
    )
    expect(r.done).toBe(7)
    expect(r.next).toBeNull()
  })
})
