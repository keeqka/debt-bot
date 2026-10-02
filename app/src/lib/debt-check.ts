// «Перед новым долгом»: что изменится, если взять рассрочку или кредит. Файл
// живёт в двух местах — app/src/lib и supabase/functions/_shared (чат считает
// то же самое на сервере): держать байт в байт одинаковыми, как budget.ts.

import { computeBudget, type BudgetInput } from './budget.ts'

export interface NewDebtInput {
  title: string
  /** Цена покупки / сумма долга. */
  price: number
  termMonths: number
  /** % годовых; 0 — рассрочка без процентов. */
  ratePct: number
}

export interface NewDebtImpact {
  /** Платёж в месяц (аннуитет). */
  monthlyPayment: number
  /** Всего выплатишь и переплата сверх цены. */
  totalPaid: number
  overpay: number
  /** Дата свободы от долгов: сейчас → с новым долгом. */
  debtFree: { before: string | null; after: string | null }
  /** На сколько месяцев сдвигается дата (положительное — позже); null — одной из дат нет. */
  shiftMonths: number | null
  /** Свободно в месяц после обычных трат и платежей: было → станет. */
  freeMonthly: { before: number; after: number }
  /** Сколько часов работы стоит цена: цена / (доход / 168); null — доход не указан. */
  workHours: number | null
}

const NEW_DEBT_ID = '__new_debt__'

/** Аннуитетный платёж: сумма, срок в месяцах, % годовых. */
export function annuityPayment(price: number, months: number, ratePct: number): number {
  if (price <= 0 || months <= 0) return 0
  const r = ratePct / 100 / 12
  if (r === 0) return price / months
  return (price * r) / (1 - Math.pow(1 + r, -months))
}

function monthsBetween(aIso: string, bIso: string) {
  return (Number(bIso.slice(0, 4)) - Number(aIso.slice(0, 4))) * 12 + (Number(bIso.slice(5, 7)) - Number(aIso.slice(5, 7)))
}

/** monthlyIncome — доход того, кто берёт долг (для «часов работы»); null — не указан. */
export function newDebtImpact(input: BudgetInput, debt: NewDebtInput, monthlyIncome: number | null): NewDebtImpact {
  const price = Math.max(0, debt.price)
  const term = Math.max(1, Math.round(debt.termMonths))
  const payment = annuityPayment(price, term, debt.ratePct)

  const before = computeBudget(input)
  const after = computeBudget({
    ...input,
    debts: [
      ...input.debts,
      {
        id: NEW_DEBT_ID,
        title: debt.title || 'Новый долг',
        status: 'active',
        minimum_payment: payment,
        current_balance: price,
        interest_rate: debt.ratePct > 0 ? debt.ratePct : null,
      },
    ],
  })

  return {
    monthlyPayment: Math.round(payment),
    totalPaid: Math.round(payment * term),
    overpay: Math.max(0, Math.round(payment * term - price)),
    debtFree: { before: before.plan.debtFreeDate, after: after.plan.debtFreeDate },
    shiftMonths: before.plan.debtFreeDate && after.plan.debtFreeDate ? monthsBetween(before.plan.debtFreeDate, after.plan.debtFreeDate) : null,
    freeMonthly: { before: Math.round(before.freeMonthly), after: Math.round(after.freeMonthly) },
    workHours: monthlyIncome != null && monthlyIncome > 0 ? Math.round((price / (monthlyIncome / 168)) * 10) / 10 : null,
  }
}
