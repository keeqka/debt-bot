import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_SETTINGS, type BudgetInput } from './budget'
import { GLOSSARY, explainParts, findTermInText, type TermId } from './glossary'

const TODAY = new Date(2026, 9, 15)
const HISTORY = ['2026-07-03', '2026-08-03', '2026-09-03'].map((spent_at, i) => ({ id: `h${i}`, amount: 400_000, spent_at, is_confirmed: true, category_id: null }))

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [700_000],
    incomes: [],
    expenses: HISTORY,
    debts: [
      { id: 'card', title: 'Кредитка', status: 'active', minimum_payment: 20_000, current_balance: 400_000, interest_rate: 36 },
      { id: 'loan', title: 'Кредит', status: 'active', minimum_payment: 30_000, current_balance: 900_000, interest_rate: 18 },
    ],
    debtPayments: [],
    hasActiveGoals: false,
    cushionBalance: 500_000,
    settings: DEFAULT_PLAN_SETTINGS,
    categoryNames: {},
    currencySymbol: '₸',
    today: TODAY,
    ...over,
  }
}

const IDS = Object.keys(GLOSSARY) as TermId[]
const flat = (id: TermId, i: BudgetInput | null) => {
  const ex = GLOSSARY[id].example({ input: i })
  return [ex.title, ...ex.rows.flatMap((r) => [r.label, r.value]), ...(ex.bars ?? []).flatMap((b) => [b.label, b.value]), ex.note ?? ''].join(' | ')
}

describe('glossary', () => {
  it('у каждого термина есть объяснение, подробности и пример', () => {
    for (const id of IDS) {
      const t = GLOSSARY[id]
      expect(t.plain.length).toBeGreaterThan(20)
      expect(t.detail.length).toBeGreaterThan(20)
      expect(GLOSSARY[id].example({ input: input() }).rows.length).toBeGreaterThan(0)
    }
  })

  it('пример на данных пользователя: сложный процент берёт самый дорогой долг и не помечен «пример»', () => {
    const ex = GLOSSARY.compound.example({ input: input() })
    expect(ex.sample).toBe(false)
    expect(ex.title).toContain('Кредитка')
    expect(ex.bars).toHaveLength(2)
    // платёж по плану переплата ниже, чем на минималке
    expect(ex.bars![1].pct).toBeLessThan(ex.bars![0].pct)
  })

  it('нет долгов: примеры на условных цифрах с пометкой sample', () => {
    for (const id of ['compound', 'gesv', 'minimum', 'refinance', 'avalanche', 'snowball'] as TermId[]) {
      expect(GLOSSARY[id].example({ input: input({ debts: [] }) }).sample).toBe(true)
    }
  })

  it('нулевой доход: ничего не падает и нет NaN', () => {
    for (const id of IDS) {
      const text = flat(id, input({ userIncomes: [0] }))
      expect(text).not.toContain('NaN')
      expect(text).not.toContain('Infinity')
    }
  })

  it('данные ещё не загрузились (input = null): примеры строятся на условных цифрах', () => {
    for (const id of IDS) expect(flat(id, null)).not.toContain('NaN')
    expect(GLOSSARY.cushion.example({ input: null }).rows).toEqual([])
  })

  it('долг без ставки: сложный процент берёт условный пример, минималка — реальный долг без переплаты', () => {
    const free = input({ debts: [{ id: 'f', title: 'Друг', status: 'active', minimum_payment: 10_000, current_balance: 120_000, interest_rate: null }] })
    expect(GLOSSARY.compound.example({ input: free }).sample).toBe(true)
    const min = GLOSSARY.minimum.example({ input: free })
    expect(min.sample).toBe(false)
    expect(min.rows[0].value).toContain('0 ₸')
  })

  it('период с 10-го числа не ломает примеры', () => {
    const i = input({ settings: { ...DEFAULT_PLAN_SETTINGS, periodStartDay: 10 } })
    for (const id of IDS) expect(flat(id, i)).not.toContain('NaN')
  })

  it('подушка: считает на реальных данных', () => {
    const ex = GLOSSARY.cushion.example({ input: input() })
    expect(ex.sample).toBe(false)
    expect(ex.rows.map((r) => r.label)).toContain('Хватит на')
  })

  it('ГЭСВ выше номинальной ставки из рекламы', () => {
    const ex = GLOSSARY.gesv.example({ input: input() })
    const nominal = Number(ex.rows[0].value.replace('%', ''))
    const gesv = Number(ex.rows[1].value.replace('%', ''))
    expect(gesv).toBeGreaterThan(nominal)
  })

  it('глубина: простое — без примера, цифры — с примером, подробно — ещё и формулы', () => {
    expect(explainParts('simple')).toEqual({ example: false, detail: false })
    expect(explainParts('numbers')).toEqual({ example: true, detail: false })
    expect(explainParts('detailed')).toEqual({ example: true, detail: true })
  })

  it('находит термин по тексту вопроса', () => {
    expect(findTermInText('Что такое ГЭСВ?')).toBe('gesv')
    expect(findTermInText('как работает снежный ком')).toBe('snowball')
    expect(findTermInText('сколько денег на еду')).toBeNull()
  })
})
