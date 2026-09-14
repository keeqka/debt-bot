// Shared "what does Claude need to know about our finances right now" builder,
// used by status, debts-strategy, goals-strategy, chat, and the weekly/monthly
// summary functions (ТЗ §7.3-§7.7) so every AI call sees the same numbers.

import { resolveBaseCurrency, currencyInstruction } from './currency.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface FinancialSnapshot {
  currency: string
  incomes: { source: string; amount: number; received_at: string }[]
  expensesByCategory: { category: string; total: number }[]
  totalIncomeLast30d: number
  totalExpenseLast30d: number
  debts: { title: string; balance: number; rate: number | null; min_payment: number }[]
  totalDebt: number
  totalMinPayments: number
  goals: { title: string; target: number; current: number }[]
}

export async function buildFinancialSnapshot(supabase: SupabaseLike): Promise<FinancialSnapshot> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const currency = await resolveBaseCurrency(supabase)

  const [{ data: incomes }, { data: expenses }, { data: debts }, { data: goals }, { data: categories }] = await Promise.all([
    supabase.from('incomes').select('source, amount, received_at').gte('received_at', since),
    supabase.from('expenses').select('amount, category_id, spent_at').gte('spent_at', since),
    supabase.from('debts').select('title, current_balance, interest_rate, minimum_payment').eq('status', 'active'),
    supabase.from('goals').select('title, target_amount, current_amount').eq('status', 'active'),
    supabase.from('categories').select('id, name'),
  ])

  const categoryName = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  const byCategory = new Map<string, number>()
  for (const e of expenses ?? []) {
    const name = categoryName.get(e.category_id) ?? 'Без категории'
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(e.amount))
  }

  return {
    currency,
    incomes: incomes ?? [],
    expensesByCategory: [...byCategory.entries()].map(([category, total]) => ({ category, total })),
    totalIncomeLast30d: (incomes ?? []).reduce((s: number, i: { amount: number }) => s + Number(i.amount), 0),
    totalExpenseLast30d: (expenses ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0),
    debts: (debts ?? []).map((d: { title: string; current_balance: number; interest_rate: number | null; minimum_payment: number }) => ({
      title: d.title,
      balance: Number(d.current_balance),
      rate: d.interest_rate,
      min_payment: Number(d.minimum_payment),
    })),
    totalDebt: (debts ?? []).reduce((s: number, d: { current_balance: number }) => s + Number(d.current_balance), 0),
    totalMinPayments: (debts ?? []).reduce((s: number, d: { minimum_payment: number }) => s + Number(d.minimum_payment), 0),
    goals: (goals ?? []).map((g: { title: string; target_amount: number; current_amount: number }) => ({
      title: g.title,
      target: Number(g.target_amount),
      current: Number(g.current_amount),
    })),
  }
}

export function snapshotToPrompt(snapshot: FinancialSnapshot): string {
  return [
    `Валюта всех сумм ниже: ${snapshot.currency}. ${currencyInstruction(snapshot.currency)}`,
    `Доход за 30 дней: ${snapshot.totalIncomeLast30d}`,
    `Расход за 30 дней: ${snapshot.totalExpenseLast30d}`,
    `Расходы по категориям: ${snapshot.expensesByCategory.map((c) => `${c.category}=${c.total}`).join(', ') || '—'}`,
    `Долги: ${snapshot.debts.map((d) => `${d.title} (остаток ${d.balance}, ${d.rate ?? 0}%, мин. платёж ${d.min_payment})`).join('; ') || 'нет'}`,
    `Общий долг: ${snapshot.totalDebt}, сумма мин. платежей/мес: ${snapshot.totalMinPayments}`,
    `Цели: ${snapshot.goals.map((g) => `${g.title} (${g.current}/${g.target})`).join('; ') || 'нет'}`,
  ].join('\n')
}
