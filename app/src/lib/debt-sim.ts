import {
  computeBudget,
  simulatePlan,
  type BudgetInput,
  type DebtStrategy,
  type PlanDebt,
  type PlanResult,
  type PlanSettings,
} from '@/lib/budget'

/**
 * Единая симуляция долгов для всего приложения: «Свобода от долгов» на Обзоре,
 * экран «План», досрочка (05), лавина или ком (06) и «Перед новым долгом» (07)
 * считают одной и той же функцией — simulatePlan из lib/budget.ts — поэтому
 * при одинаковых входных данных дата совпадает до месяца. Здесь только тонкая
 * обёртка с удобным ответом и расчёты «что если» поверх computeBudget.
 */

export interface SimInput {
  debts: PlanDebt[]
  /** Деньги сверх обычных трат и платежей по долгам, в месяц. */
  monthlyExtra: number
  settings: PlanSettings
  cushionBalance: number
  /** Обычный месяц: обычные траты + платежи. В нём меряется подушка. */
  monthlyNeed: number
  start?: Date
}

export interface SimOverrides {
  monthlyExtra?: number
  debts?: PlanDebt[]
  settings?: Partial<PlanSettings>
  rollover?: boolean
}

export interface SimResult {
  debtFreeDate: string | null
  totalInterest: number
  /** По каждому долгу: когда закроется (null — не закроется за 50 лет). */
  perDebt: Array<{ id: string; title: string; closes: string | null; months: number | null }>
  plan: PlanResult
}

export function simulate(input: SimInput, overrides: SimOverrides = {}): SimResult {
  const debts = overrides.debts ?? input.debts
  const plan = simulatePlan({
    debts,
    monthlyExtra: overrides.monthlyExtra ?? input.monthlyExtra,
    settings: { ...input.settings, ...overrides.settings },
    cushionBalance: input.cushionBalance,
    monthlyNeed: input.monthlyNeed,
    start: input.start ?? new Date(),
    rollover: overrides.rollover,
  })
  const closed = new Map(plan.closures.map((c) => [c.id, c]))
  return {
    debtFreeDate: plan.debtFreeDate,
    totalInterest: plan.totalInterest,
    perDebt: debts.map((d) => ({
      id: d.id,
      title: d.title,
      closes: closed.get(d.id)?.date ?? null,
      months: closed.get(d.id)?.months ?? null,
    })),
    plan,
  }
}

/** Целых месяцев от a до b (ISO-даты), день месяца не учитывается; b позже a — положительное. */
export function monthsBetween(aIso: string, bIso: string): number {
  return (Number(bIso.slice(0, 4)) - Number(aIso.slice(0, 4))) * 12 + (Number(bIso.slice(5, 7)) - Number(aIso.slice(5, 7)))
}

// ═══ Досрочка (05) ═════════════════════════════════════════════════════════

export type EarlyMode = 'once' | 'monthly'

export interface EarlyPayoffImpact {
  before: { debtFreeDate: string | null; totalInterest: number; toCushion: number; debtCloses: string | null }
  after: { debtFreeDate: string | null; totalInterest: number; toCushion: number; debtCloses: string | null }
  /** На сколько месяцев раньше закроются все долги; null — одна из дат не определена. */
  monthsSaved: number | null
  /** Сколько процентов не придётся заплатить; не меньше нуля. */
  interestSaved: number
  /** Платёж по этому долгу в месяц после решения. */
  newPayment: number
  /** Взнос в подушку в этом месяце: был по плану → станет. short — станет меньше. */
  cushion: { before: number; after: number; short: boolean }
}

/**
 * Что даст досрочка по одному долгу. Считает бюджет дважды — как есть и с
 * изменением — той же computeBudget, что и весь экран, поэтому дата, переплата
 * и взнос в подушку согласованы с «Обзором» и «Планом».
 *  - once: разовый платёж сегодня — баланс падает, платёж записан как досрочный;
 *  - monthly: итоговый ежемесячный взнос сверх минимума (debts.extra_monthly, а не
 *    добавка к нему) — часть платежа по долгу, уменьшает общий пул «сверх минимумов».
 */
export function earlyPayoffImpact(input: BudgetInput, debtId: string, mode: EarlyMode, amount: number): EarlyPayoffImpact {
  const before = computeBudget(input)
  const target = input.debts.find((d) => d.id === debtId)
  const x = Math.max(0, amount)

  const changed: BudgetInput =
    mode === 'monthly'
      ? { ...input, debts: input.debts.map((d) => (d.id === debtId ? { ...d, extra_monthly: x } : d)) }
      : {
          ...input,
          debts: input.debts.map((d) => (d.id === debtId ? { ...d, current_balance: Math.max(0, d.current_balance - x) } : d)),
          debtPayments: [
            ...input.debtPayments,
            { debt_id: debtId, amount: Math.min(x, target?.current_balance ?? x), paid_at: isoDay(input.today ?? new Date()) },
          ],
        }
  const after = computeBudget(changed)

  const summary = (b: typeof before) => ({
    debtFreeDate: b.plan.debtFreeDate,
    totalInterest: b.plan.totalInterest,
    toCushion: b.plan.now.toCushion,
    // Когда закроется именно этот долг: общая дата зависит от самого долгого, а этот может уйти раньше.
    debtCloses: b.plan.closures.find((c) => c.id === debtId)?.date ?? null,
  })
  const b = summary(before)
  const a = summary(after)

  return {
    before: b,
    after: a,
    monthsSaved: b.debtFreeDate && a.debtFreeDate ? monthsBetween(a.debtFreeDate, b.debtFreeDate) : null,
    interestSaved: Math.max(0, b.totalInterest - a.totalInterest),
    newPayment: target ? target.minimum_payment + (mode === 'monthly' ? x : (target.extra_monthly ?? 0)) : 0,
    cushion: { before: b.toCushion, after: a.toCushion, short: a.toCushion < b.toCushion },
  }
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ═══ Лавина или ком (06) ═══════════════════════════════════════════════════

export interface StrategyOutcome {
  strategy: DebtStrategy
  debtFreeDate: string | null
  totalInterest: number
  /** Через сколько месяцев закроется первый долг; null — ни один не закроется. */
  firstClosedMonths: number | null
}

/** Стратегии на одной и той же сумме платежа: меняется только порядок гашения. */
export function compareStrategies(input: SimInput, strategies: DebtStrategy[] = ['avalanche', 'snowball']): StrategyOutcome[] {
  return strategies.map((strategy) => {
    const r = simulate(input, { settings: { strategy } })
    const first = r.plan.closures.length ? Math.min(...r.plan.closures.map((c) => c.months)) : null
    return { strategy, debtFreeDate: r.debtFreeDate, totalInterest: r.totalInterest, firstClosedMonths: first }
  })
}

export interface StrategyVerdict {
  /** Разница в переплате меньше 3% — выбирать можно по ощущениям. */
  minimal: boolean
  /** У какой стратегии переплата меньше и на сколько. */
  cheaper: { strategy: DebtStrategy; by: number } | null
  /** Какая стратегия закрывает первый долг раньше и на сколько месяцев. */
  fasterFirst: { strategy: DebtStrategy; by: number } | null
}

export function strategyVerdict(a: StrategyOutcome, b: StrategyOutcome): StrategyVerdict {
  const high = Math.max(a.totalInterest, b.totalInterest)
  const diff = Math.abs(a.totalInterest - b.totalInterest)
  const minimal = high === 0 || diff / high < 0.03
  const cheaper = diff > 0 ? { strategy: a.totalInterest < b.totalInterest ? a.strategy : b.strategy, by: diff } : null
  const gap = a.firstClosedMonths != null && b.firstClosedMonths != null ? Math.abs(a.firstClosedMonths - b.firstClosedMonths) : 0
  const fasterFirst =
    gap > 0 && a.firstClosedMonths != null && b.firstClosedMonths != null
      ? { strategy: a.firstClosedMonths < b.firstClosedMonths ? a.strategy : b.strategy, by: gap }
      : null
  return { minimal, cheaper, fasterFirst }
}
