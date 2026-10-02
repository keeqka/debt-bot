// Модель оценки месяца (04) и индекс свободы. Файл живёт в двух местах —
// app/src/lib и supabase/functions/_shared (status и чат читают ту же оценку):
// держать байт в байт одинаковыми, как budget.ts.
//
// Модель влияет ТОЛЬКО на оценку месяца и на status. Цифру «можно тратить»
// (Budget.available / perDay) она не меняет.

import { computeBudget, type BudgetInput } from './budget.ts'

export type BudgetModelId = '50_30_20' | 'zero_based' | 'pay_yourself_first'

export interface ModelRow {
  label: string
  /** Сумма в валюте или доля дохода — готовая строка для показа. */
  value: string
  /** Норма модели, если есть: «до 50%». */
  target?: string
  state: 'ok' | 'warn' | 'info'
}

export interface ModelAssessment {
  model: BudgetModelId
  hasIncome: boolean
  headline: string
  rows: ModelRow[]
  /** Обязательные расходы / доход (0…1+): чем меньше, тем больше свободы. null — дохода нет. */
  freedomIndex: number | null
  /** Что даёт главный вес обязательным расходам: категория или «Платежи по долгам». */
  freedomMain: string | null
  /** Две-три строки для промпта ИИ (status, чат). */
  note: string
}

export const MODEL_META: Record<BudgetModelId, { label: string; description: string }> = {
  '50_30_20': { label: '50 / 30 / 20', description: '50% дохода — на нужное, 30% — на желания, 20% — откладывать и гасить долги сверх минимума.' },
  zero_based: { label: 'Каждый тенге назначен', description: 'Доход минус всё, что уже назначено (траты, платежи, откладывание): остаток должен стремиться к нулю — его стоит куда-то отправить.' },
  pay_yourself_first: { label: 'Сначала себе', description: 'Сначала откладываешь в долги, подушку и цели, потом тратишь. Смотрим, какую долю дохода ты отдаёшь «себе» заранее.' },
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const money = (n: number, symbol: string) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${symbol}`

export function assessMonth(input: BudgetInput, model: BudgetModelId): ModelAssessment {
  const b = computeBudget(input)
  const symbol = input.currencySymbol
  const kindOf = (id: string) => input.categoryNeedKinds?.[id] ?? null // нет пометки — нужное

  // Обязательное по категориям: обычный месяц (typical), а если истории нет — то, что уже потрачено.
  const needs = b.categories.filter((c) => kindOf(c.id) !== 'want').map((c) => ({ name: c.name, amount: c.typical ?? c.amount }))
  const needsTypical = needs.reduce((s, c) => s + c.amount, 0)
  const wantsSpent = b.categories.filter((c) => kindOf(c.id) === 'want').reduce((s, c) => s + c.amount, 0)
  const needsSpent = b.categories.filter((c) => kindOf(c.id) !== 'want').reduce((s, c) => s + c.amount, 0)
  const toSavings = b.plan.now.toDebts + b.plan.now.toCushion + b.plan.now.toGoals + b.annualReserve
  const payments = input.debts
    .filter((d) => d.status === 'active' && d.current_balance > 0)
    .reduce((s, d) => s + d.minimum_payment + (d.extra_monthly ?? 0), 0)

  // Индекс свободы: обязательные / доход, и кто в них главный.
  const mandatory = needsTypical + payments + b.annualReserve
  const contributors = [...needs.map((c) => ({ name: c.name, amount: c.amount })), { name: 'Платежи по долгам', amount: payments }, { name: 'Крупные траты года', amount: b.annualReserve }]
  const main = contributors.filter((c) => c.amount > 0).sort((a, c) => c.amount - a.amount)[0] ?? null
  const freedomIndex = b.hasIncome ? mandatory / b.income : null

  if (!b.hasIncome) {
    return {
      model,
      hasIncome: false,
      headline: 'Укажи доход — тогда оценю месяц по модели.',
      rows: [],
      freedomIndex: null,
      freedomMain: main?.name ?? null,
      note: 'Модель оценки: доход не указан, оценить нечего.',
    }
  }

  const income = b.income
  let headline = ''
  let rows: ModelRow[] = []

  if (model === '50_30_20') {
    const needsShare = (needsSpent + payments) / income
    const wantsShare = wantsSpent / income
    const savingsShare = toSavings / income
    rows = [
      { label: 'Нужное (с платежами по долгам)', value: pct(needsShare), target: 'до 50%', state: needsShare <= 0.5 ? 'ok' : 'warn' },
      { label: 'Желания', value: pct(wantsShare), target: 'до 30%', state: wantsShare <= 0.3 ? 'ok' : 'warn' },
      { label: 'Откладываю и гашу сверх минимума', value: pct(savingsShare), target: 'от 20%', state: savingsShare >= 0.2 ? 'ok' : 'warn' },
    ]
    const bad = rows.filter((r) => r.state === 'warn')
    headline = bad.length ? `Не по 50/30/20: ${bad.map((r) => r.label.split(' (')[0].toLowerCase()).join(', ')}.` : 'Месяц укладывается в 50/30/20.'
  } else if (model === 'zero_based') {
    const assigned = b.spent + b.obligations
    const left = income - assigned
    const state: ModelRow['state'] = left < 0 ? 'warn' : left <= income * 0.03 ? 'ok' : 'info'
    rows = [
      { label: 'Назначено: траты, платежи, откладывание', value: money(assigned, symbol), state: 'info' },
      { label: left < 0 ? 'Назначено больше дохода' : 'Не назначено', value: money(Math.abs(left), symbol), target: 'около нуля', state },
    ]
    headline =
      left < 0
        ? `Назначено больше дохода на ${money(-left, symbol)}.`
        : left <= income * 0.03
          ? 'Почти каждый тенге назначен.'
          : `Не назначено ${money(left, symbol)} — отправь их в долг, подушку или цель.`
  } else {
    const share = toSavings / income
    rows = [
      { label: 'Откладываю заранее', value: money(toSavings, symbol), state: 'info' },
      { label: 'Доля дохода', value: pct(share), target: 'от 20%', state: share >= 0.2 ? 'ok' : 'warn' },
    ]
    headline = share >= 0.2 ? `Сначала себе: ${pct(share)} дохода уходит в долги, подушку и цели.` : `Себе заранее — ${pct(share)} дохода; ориентир — от 20%.`
  }

  const freedomLine = `Индекс свободы ${pct(mandatory / income)}${main ? `, главный вес — ${main.name}` : ''}.`
  return {
    model,
    hasIncome: true,
    headline,
    rows,
    freedomIndex,
    freedomMain: main?.name ?? null,
    note: `Модель оценки «${MODEL_META[model].label}»: ${headline} ${freedomLine}`,
  }
}
