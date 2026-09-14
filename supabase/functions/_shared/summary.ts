// Shared by cron-weekly-summary and cron-monthly-summary (ТЗ §7.4).

import { currencyInstruction } from './currency.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export const SUMMARY_TOOL = {
  name: 'report_period_summary',
  description: 'Weekly or monthly financial summary formatted for a single Telegram message.',
  input_schema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['week', 'month'] },
      status_emoji: { type: 'string', description: 'один эмодзи: 🟢🟡🟠🔴' },
      telegram_text: { type: 'string', description: 'Markdown, до 700 символов, по-русски' },
      top_category_changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { category: { type: 'string' }, delta_percent: { type: 'number' } },
          required: ['category', 'delta_percent'],
        },
      },
      one_recommendation: { type: 'string' },
    },
    required: ['period', 'status_emoji', 'telegram_text', 'top_category_changes', 'one_recommendation'],
  },
}

export interface PeriodMetrics {
  totalExpense: number
  totalIncome: number
  byCategory: Record<string, number>
  debtPaymentsTotal: number
}

export async function getPeriodMetrics(supabase: SupabaseLike, fromISO: string, toISO: string): Promise<PeriodMetrics> {
  const [{ data: expenses }, { data: incomes }, { data: debtPayments }, { data: categories }] = await Promise.all([
    supabase.from('expenses').select('amount, category_id').gte('spent_at', fromISO).lt('spent_at', toISO),
    supabase.from('incomes').select('amount').gte('received_at', fromISO).lt('received_at', toISO),
    supabase.from('debt_payments').select('amount').gte('paid_at', fromISO).lt('paid_at', toISO),
    supabase.from('categories').select('id, name'),
  ])

  const categoryName = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  const byCategory: Record<string, number> = {}
  for (const e of expenses ?? []) {
    const name = categoryName.get(e.category_id) ?? 'Без категории'
    byCategory[name] = (byCategory[name] ?? 0) + Number(e.amount)
  }

  return {
    totalExpense: (expenses ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0),
    totalIncome: (incomes ?? []).reduce((s: number, i: { amount: number }) => s + Number(i.amount), 0),
    byCategory,
    debtPaymentsTotal: (debtPayments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0),
  }
}

export function metricsToPrompt(current: PeriodMetrics, previous: PeriodMetrics, currency: string): string {
  return [
    `Валюта всех сумм ниже: ${currency}. ${currencyInstruction(currency)}`,
    `Расходы за период: ${current.totalExpense} (прошлый период: ${previous.totalExpense})`,
    `Доходы за период: ${current.totalIncome} (прошлый период: ${previous.totalIncome})`,
    `Платежи по долгам за период: ${current.debtPaymentsTotal}`,
    `По категориям: ${Object.entries(current.byCategory).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}`,
  ].join('\n')
}
