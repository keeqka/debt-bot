// Shared "what does Claude need to know about our finances right now" builder,
// used by status, goals-strategy and chat so every AI call sees the same
// numbers — and the same numbers as the app: the budget is computed by
// ./budget.ts, a copy of app/src/lib/budget.ts, from the same rows.

import { resolveBaseCurrency, currencyInstruction } from './currency.ts'
import { computeBudget, type Budget } from './budget.ts'
import { simulateDebtPayoff } from './debt-simulation.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface SnapshotDebt {
  id: string
  title: string
  balance: number
  rate: number | null
  min_payment: number
}

export interface FinancialSnapshot {
  currency: string
  budget: Budget
  debts: SnapshotDebt[]
  totalDebt: number
  /** When the last debt closes if the budget's monthly extra keeps going to debts (avalanche); null — no debts or never. */
  debtFreeDate: string | null
  goals: { title: string; target: number; current: number; target_date: string | null }[]
  /** Every category name the household has — for the chat's duplicate check. */
  categoryNames: string[]
}

const CURRENCY_SYMBOLS: Record<string, string> = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' }

/** Calendar "today" in the household's timezone — the edge runtime is UTC, the family isn't. */
function localToday(timeZone: string) {
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone }))
  } catch {
    return new Date()
  }
}

function monthStart(today: Date, monthsBack: number) {
  const d = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Avalanche order — the plan's default, same as the app's Overview/Debts. */
export function avalancheOrder(debts: SnapshotDebt[]) {
  return [...debts]
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
    .map((d) => ({ id: d.id, current_balance: d.balance, interest_rate: d.rate, minimum_payment: d.min_payment }))
}

export async function buildFinancialSnapshot(supabase: SupabaseLike): Promise<FinancialSnapshot> {
  const [currency, { data: users }] = await Promise.all([
    resolveBaseCurrency(supabase),
    supabase.from('users').select('id, monthly_income, timezone'),
  ])
  const today = localToday(users?.[0]?.timezone ?? 'Asia/Almaty')

  const [{ data: incomes }, { data: expenses }, { data: debts }, { data: debtPayments }, { data: goals }, { data: categories }] =
    await Promise.all([
      supabase.from('incomes').select('amount, received_at').gte('received_at', monthStart(today, 1)),
      supabase
        .from('expenses')
        .select('id, amount, category_id, spent_at, is_confirmed, merchant, description')
        .gte('spent_at', monthStart(today, 3)),
      supabase.from('debts').select('id, title, current_balance, interest_rate, minimum_payment, status').eq('status', 'active'),
      supabase.from('debt_payments').select('debt_id, amount, paid_at').gte('paid_at', monthStart(today, 0)),
      supabase.from('goals').select('title, target_amount, current_amount, target_date').eq('status', 'active'),
      supabase.from('categories').select('id, name'),
    ])

  const num = (v: unknown) => Number(v ?? 0)
  const activeDebts: Array<{ id: string; title: string; status: string; current_balance: number; interest_rate: number | null; minimum_payment: number }> = (debts ?? []).map((d: Record<string, unknown>) => ({
    id: String(d.id),
    title: String(d.title),
    status: 'active',
    current_balance: num(d.current_balance),
    interest_rate: d.interest_rate == null ? null : num(d.interest_rate),
    minimum_payment: num(d.minimum_payment),
  }))

  const budget = computeBudget({
    userIncomes: (users ?? []).map((u: { monthly_income: number | null }) => (u.monthly_income == null ? null : num(u.monthly_income))),
    incomes: (incomes ?? []).map((i: Record<string, unknown>) => ({ amount: num(i.amount), received_at: String(i.received_at) })),
    expenses: (expenses ?? []).map((e: Record<string, unknown>) => ({
      id: String(e.id),
      amount: num(e.amount),
      spent_at: String(e.spent_at),
      is_confirmed: Boolean(e.is_confirmed),
      category_id: (e.category_id as string | null) ?? null,
      merchant: (e.merchant as string | null) ?? null,
      description: (e.description as string | null) ?? null,
    })),
    debts: activeDebts,
    debtPayments: (debtPayments ?? []).map((p: Record<string, unknown>) => ({ debt_id: String(p.debt_id), amount: num(p.amount), paid_at: String(p.paid_at) })),
    hasActiveGoals: (goals ?? []).length > 0,
    categoryNames: Object.fromEntries((categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name])),
    currencySymbol: CURRENCY_SYMBOLS[currency] ?? currency,
    today,
  })

  const snapshotDebts: SnapshotDebt[] = activeDebts.map((d) => ({
    id: d.id,
    title: d.title,
    balance: d.current_balance,
    rate: d.interest_rate,
    min_payment: d.minimum_payment,
  }))

  return {
    currency,
    budget,
    debts: snapshotDebts,
    totalDebt: snapshotDebts.reduce((s, d) => s + d.balance, 0),
    debtFreeDate: snapshotDebts.length ? simulateDebtPayoff(avalancheOrder(snapshotDebts), budget.planExtra).estimatedPayoffDate : null,
    goals: (goals ?? []).map((g: Record<string, unknown>) => ({
      title: String(g.title),
      target: num(g.target_amount),
      current: num(g.current_amount),
      target_date: (g.target_date as string | null) ?? null,
    })),
    categoryNames: (categories ?? []).map((c: { name: string }) => c.name),
  }
}

const INCOME_SOURCE: Record<Budget['incomeSource'], string> = {
  settings: 'из настроек',
  this_month: 'поступления этого месяца',
  last_month: 'поступления прошлого месяца — зарплату этого месяца ещё не записали',
  none: 'не указан',
}

export function snapshotToPrompt(s: FinancialSnapshot): string {
  const b = s.budget
  const r = (n: number) => Math.round(n)
  const planTo = b.planTarget === 'debts' ? 'в долги' : b.planTarget === 'goals' ? 'в цели' : 'никуда — нет ни долгов, ни целей'
  return [
    `Валюта всех сумм ниже: ${s.currency}. ${currencyInstruction(s.currency)}`,
    'Правило денег семьи: сначала минимальные платежи по долгам, потом всё сверх обычных трат — досрочно в долги (самый дорогой по ставке первым). Цели копятся только после закрытия всех долгов. Советы давай в этой логике: главное — гасить долги и не выходить за обычные траты.',
    `Доход в месяц: ${r(b.income)} (${INCOME_SOURCE[b.incomeSource]}).`,
    `Обычные траты в месяц: ${r(b.typicalSpend)} (${b.historyMonths ? `среднее за ${b.historyMonths} мес.` : 'первый месяц — оценка по текущему темпу, истории ещё нет'}).`,
    `Минимальные платежи по долгам: ${r(b.minPayments)} в месяц. Сверх минимумов по плану: ${r(b.planExtra)} в месяц → ${planTo}.`,
    `Этот месяц (день ${b.dayOfMonth} из ${b.daysInMonth}, осталось ${b.daysLeft} дн.): потрачено ${r(b.spent)}; по долгам внесено ${r(b.debtPaid)}, ещё отложить ${r(b.reserved)}; бюджет на траты ${r(b.limit)}; свободно до конца месяца ${r(b.available)} (≈${r(b.perDay)} в день).`,
    b.expectedByNow != null ? `Обычно к этому дню месяца потрачено: ${r(b.expectedByNow)}.` : '',
    `Траты этого месяца по категориям: ${b.categories.map((c) => `${c.name}=${r(c.amount)}${c.typical != null ? ` (обычно за месяц ${r(c.typical)})` : ''}`).join(', ') || '—'}.`,
    `Перерасход и аномалии: ${b.signals.length ? b.signals.map((x) => x.text).join(' ') : 'не найдено'}`,
    `Долги: ${s.debts.map((d) => `${d.title} (остаток ${r(d.balance)}, ${d.rate ?? 0}%, мин. платёж ${r(d.min_payment)})`).join('; ') || 'нет'}. Общий долг: ${r(s.totalDebt)}.`,
    s.debts.length ? `Все долги закроются: ${s.debtFreeDate ?? 'не закроются — сверх минимумов нечего вносить, а минимумы не покрывают проценты'}.` : '',
    `Цели: ${s.goals.map((g) => `${g.title} (${r(g.current)}/${r(g.target)}${g.target_date ? `, срок ${g.target_date}` : ''})`).join('; ') || 'нет'}.`,
  ]
    .filter(Boolean)
    .join('\n')
}
