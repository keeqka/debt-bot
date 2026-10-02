import { describe, expect, it } from 'vitest'
import { computeBudget, DEFAULT_PLAN_SETTINGS, type BudgetInput } from './budget'
import { compareStrategies, earlyPayoffImpact, monthsBetween, simulate, strategyVerdict, type SimInput } from './debt-sim'

const TODAY = new Date(2026, 9, 15) // 15 октября 2026

/** Три полных прошлых месяца обычных трат по 450 000: свободных денег остаётся ~100 000 в месяц. */
const HISTORY = ['2026-07-03', '2026-08-03', '2026-09-03'].map((spent_at, i) => ({
  id: `h${i}`,
  amount: 450_000,
  spent_at,
  is_confirmed: true,
  category_id: null,
}))

function input(over: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userIncomes: [600_000],
    incomes: [],
    expenses: HISTORY,
    debts: [
      { id: 'card', title: 'Карта', status: 'active', minimum_payment: 20_000, current_balance: 400_000, interest_rate: 30 },
      { id: 'loan', title: 'Кредит', status: 'active', minimum_payment: 30_000, current_balance: 900_000, interest_rate: 18 },
    ],
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

describe('simulate', () => {
  it('одна и та же симуляция, что внутри computeBudget', () => {
    const i = input()
    const b = computeBudget(i)
    const s = simulate(
      {
        debts: i.debts.map((d) => ({ id: d.id, title: d.title, balance: d.current_balance, rate: d.interest_rate, min: d.minimum_payment })),
        monthlyExtra: b.planExtra,
        settings: b.settings,
        cushionBalance: b.cushionBalance,
        monthlyNeed: b.monthlyNeed,
        start: TODAY,
      },
    )
    expect(s.debtFreeDate).toBe(b.plan.debtFreeDate)
    expect(s.totalInterest).toBe(b.plan.totalInterest)
  })

  it('нет долгов — даты нет и список пуст', () => {
    const s = simulate({ debts: [], monthlyExtra: 100_000, settings: DEFAULT_PLAN_SETTINGS, cushionBalance: 0, monthlyNeed: 0, start: TODAY })
    expect(s.debtFreeDate).toBeNull()
    expect(s.perDebt).toEqual([])
    expect(s.totalInterest).toBe(0)
  })

  it('долг без ставки закрывается без процентов', () => {
    const s = simulate({
      debts: [{ id: 'a', title: 'Друг', balance: 120_000, rate: null, min: 10_000 }],
      monthlyExtra: 0,
      settings: DEFAULT_PLAN_SETTINGS,
      cushionBalance: 0,
      monthlyNeed: 0,
      start: TODAY,
    })
    expect(s.totalInterest).toBe(0)
    expect(s.perDebt[0].months).toBe(12)
    expect(s.debtFreeDate?.slice(0, 7)).toBe('2027-10')
  })

  it('overrides меняют сумму сверх минимумов и стратегию', () => {
    const base = {
      debts: [
        { id: 'a', title: 'A', balance: 100_000, rate: 40, min: 5_000 },
        { id: 'b', title: 'B', balance: 20_000, rate: 5, min: 2_000 },
      ],
      monthlyExtra: 10_000,
      settings: DEFAULT_PLAN_SETTINGS,
      cushionBalance: 0,
      monthlyNeed: 0,
      start: TODAY,
    }
    const avalanche = simulate(base)
    const snowball = simulate(base, { settings: { strategy: 'snowball' } })
    expect(snowball.perDebt.find((d) => d.id === 'b')!.months!).toBeLessThan(avalanche.perDebt.find((d) => d.id === 'b')!.months!)
    expect(avalanche.totalInterest).toBeLessThan(snowball.totalInterest)
    expect(simulate(base, { monthlyExtra: 0 }).totalInterest).toBeGreaterThan(avalanche.totalInterest)
  })
})

describe('monthsBetween', () => {
  it('считает целые месяцы', () => {
    expect(monthsBetween('2026-10-15', '2027-01-02')).toBe(3)
    expect(monthsBetween('2027-01-02', '2026-10-15')).toBe(-3)
  })
})

describe('earlyPayoffImpact', () => {
  it('разовый платёж приближает дату и экономит проценты', () => {
    const e = earlyPayoffImpact(input(), 'card', 'once', 300_000)
    expect(e.monthsSaved).toBeGreaterThan(0)
    expect(e.interestSaved).toBeGreaterThan(0)
    expect(e.after.debtFreeDate! < e.before.debtFreeDate!).toBe(true)
    expect(e.after.debtCloses! < e.before.debtCloses!).toBe(true)
  })

  it('нулевая сумма ничего не меняет', () => {
    const e = earlyPayoffImpact(input(), 'card', 'once', 0)
    expect(e.monthsSaved).toBe(0)
    expect(e.interestSaved).toBe(0)
    expect(e.cushion.short).toBe(false)
  })

  it('ежемесячный взнос входит в платёж по долгу', () => {
    const e = earlyPayoffImpact(input(), 'card', 'monthly', 15_000)
    expect(e.newPayment).toBe(35_000)
  })

  it('режим «сначала подушка»: ежемесячный взнос отнимает у подушки и об этом сообщается', () => {
    const settings = { ...DEFAULT_PLAN_SETTINGS, mode: 'cushion_first' as const }
    const e = earlyPayoffImpact(input({ settings, cushionBalance: 100_000 }), 'card', 'monthly', 50_000)
    expect(e.cushion.before).toBeGreaterThan(0)
    expect(e.cushion.after).toBeLessThan(e.cushion.before)
    expect(e.cushion.short).toBe(true)
  })

  it('нулевой доход: расчёт не падает, подушку не трогаем', () => {
    const e = earlyPayoffImpact(input({ userIncomes: [0] }), 'card', 'once', 50_000)
    expect(Number.isFinite(e.interestSaved)).toBe(true)
    expect(e.cushion.short).toBe(false)
  })

  it('долг без ставки: экономия процентов нулевая', () => {
    const debts = [{ id: 'friend', title: 'Друг', status: 'active', minimum_payment: 10_000, current_balance: 800_000, interest_rate: null }]
    const e = earlyPayoffImpact(input({ debts }), 'friend', 'once', 300_000)
    expect(e.interestSaved).toBe(0)
    expect(e.monthsSaved).toBeGreaterThan(0)
  })

  it('нет долгов: даты нет, месяцев сэкономлено нет', () => {
    const e = earlyPayoffImpact(input({ debts: [] }), 'nope', 'once', 10_000)
    expect(e.monthsSaved).toBeNull()
    expect(e.before.debtFreeDate).toBeNull()
  })

  it('период с 10-го числа: платёж 12-го идёт в текущий период и считается внесённым', () => {
    const settings = { ...DEFAULT_PLAN_SETTINGS, periodStartDay: 10 }
    const e = earlyPayoffImpact(input({ settings }), 'card', 'once', 300_000)
    expect(e.monthsSaved).toBeGreaterThan(0)
    // период начался 10 октября: платёж 15-го учтён как досрочный в этом периоде, дата не хуже, чем без него
    expect(e.after.debtFreeDate! <= e.before.debtFreeDate!).toBe(true)
  })
})

describe('compareStrategies / strategyVerdict', () => {
  const base: SimInput = {
    debts: [
      { id: 'big', title: 'Дорогой', balance: 500_000, rate: 40, min: 15_000 },
      { id: 'small', title: 'Мелкий', balance: 40_000, rate: 8, min: 4_000 },
    ],
    monthlyExtra: 30_000,
    settings: DEFAULT_PLAN_SETTINGS,
    cushionBalance: 0,
    monthlyNeed: 0,
    start: TODAY,
  }

  it('лавина переплачивает меньше, ком закрывает первый долг раньше', () => {
    const [av, sn] = compareStrategies(base)
    expect(av.totalInterest).toBeLessThan(sn.totalInterest)
    expect(sn.firstClosedMonths!).toBeLessThan(av.firstClosedMonths!)
    const v = strategyVerdict(av, sn)
    expect(v.minimal).toBe(false)
    expect(v.cheaper?.strategy).toBe('avalanche')
    expect(v.fasterFirst?.strategy).toBe('snowball')
  })

  it('один долг: разница нулевая, выбирать можно по ощущениям', () => {
    const one = { ...base, debts: [base.debts[0]] }
    const [av, sn] = compareStrategies(one)
    expect(strategyVerdict(av, sn).minimal).toBe(true)
    expect(strategyVerdict(av, sn).cheaper).toBeNull()
  })

  it('долги без ставки: переплаты нет — разница минимальная', () => {
    const free = { ...base, debts: base.debts.map((d) => ({ ...d, rate: null })) }
    const [av, sn] = compareStrategies(free)
    expect(av.totalInterest).toBe(0)
    expect(strategyVerdict(av, sn).minimal).toBe(true)
  })

  it('нет долгов: ничего не закрывается, вердикт «минимальная»', () => {
    const [av, sn] = compareStrategies({ ...base, debts: [] })
    expect(av.debtFreeDate).toBeNull()
    expect(av.firstClosedMonths).toBeNull()
    expect(strategyVerdict(av, sn).minimal).toBe(true)
    expect(strategyVerdict(av, sn).fasterFirst).toBeNull()
  })

  it('cash_flow можно добавить третьей', () => {
    expect(compareStrategies(base, ['avalanche', 'snowball', 'cash_flow'])).toHaveLength(3)
  })
})
