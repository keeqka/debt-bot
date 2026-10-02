// Shared "what does Claude need to know about our finances right now" builder,
// used by status, goals-strategy and chat so every AI call sees the same
// numbers — and the same numbers as the app: the budget is computed by
// ./budget.ts, a copy of app/src/lib/budget.ts, from the same rows.

import { resolveBaseCurrency, currencyInstruction } from './currency.ts'
import { computeBudget, DEFAULT_PLAN_SETTINGS, type Budget, type BudgetInput, type PlanSettings } from './budget.ts'
import { assessMonth, type BudgetModelId } from './budget-model.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface SnapshotDebt {
  id: string
  title: string
  balance: number
  rate: number | null
  min_payment: number
  /** Ежемесячный взнос сверх минимума; в min_payment его нет, но в плане он часть платежа. */
  extra_monthly: number
}

export interface FinancialSnapshot {
  currency: string
  budget: Budget
  /** Входы бюджета — чтобы чат пересчитал «что будет, если» той же моделью. */
  budgetInput: BudgetInput
  /** Члены семьи и их доход из настроек — доход меняется у конкретного человека. */
  users: Array<{ id: string; monthly_income: number | null }>
  debts: SnapshotDebt[]
  totalDebt: number
  /** When the last debt closes if the budget's monthly extra keeps going to debts (avalanche); null — no debts or never. */
  debtFreeDate: string | null
  goals: { title: string; target: number; current: number; target_date: string | null }[]
  /** Every category name the household has — for the chat's duplicate check. */
  categoryNames: string[]
  /** Модель оценки месяца из настроек: влияет на оценку и status, но не на «можно тратить». */
  budgetModel: BudgetModelId
  /** Правило паузы перед покупкой (настройки): порог null — выключено. */
  pause: { threshold: number | null; hours: number }
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

/**
 * householdId — only for service-role callers (crons), whose client sees
 * every family; a user-scoped client is limited to its family by RLS already.
 */
export async function buildFinancialSnapshot(supabase: SupabaseLike, householdId?: string): Promise<FinancialSnapshot> {
  // deno-lint-ignore no-explicit-any
  const scope = (q: any) => (householdId ? q.eq('household_id', householdId) : q)
  const [currency, { data: users }] = await Promise.all([
    resolveBaseCurrency(supabase, householdId),
    scope(supabase.from('users').select('id, monthly_income, timezone')),
  ])
  const today = localToday(users?.[0]?.timezone ?? 'Asia/Almaty')

  const [{ data: incomes }, { data: expenses }, { data: debts }, { data: debtPayments }, { data: goals }, { data: categories }, { data: settingsRow }, { data: annual }] =
    await Promise.all([
      scope(supabase.from('incomes').select('amount, received_at')).gte('received_at', monthStart(today, 2)),
      scope(supabase.from('expenses').select('id, amount, category_id, spent_at, is_confirmed, merchant, description')).gte(
        'spent_at',
        monthStart(today, 4),
      ),
      scope(supabase.from('debts').select('id, title, current_balance, interest_rate, minimum_payment, extra_monthly, status')).eq('status', 'active'),
      scope(supabase.from('debt_payments').select('debt_id, amount, paid_at')).gte('paid_at', monthStart(today, 1)),
      scope(supabase.from('goals').select('title, target_amount, current_amount, target_date, is_cushion')).eq('status', 'active'),
      householdId
        ? supabase.from('categories').select('id, name, need_kind').or(`household_id.is.null,household_id.eq.${householdId}`)
        : supabase.from('categories').select('id, name, need_kind'),
      scope(supabase.from('household_settings').select('*')).maybeSingle(),
      scope(supabase.from('annual_expenses').select('amount, saved, month')),
    ])

  const settings: PlanSettings = settingsRow
    ? {
        mode: settingsRow.priority_mode,
        strategy: settingsRow.debt_strategy,
        cushionMonths: Number(settingsRow.cushion_months),
        splitDebtPct: Number(settingsRow.split_debt_pct),
        highRateThreshold: Number(settingsRow.high_rate_threshold),
        periodStartDay: settingsRow.period_start_day == null ? null : Number(settingsRow.period_start_day),
      }
    : DEFAULT_PLAN_SETTINGS

  const num = (v: unknown) => Number(v ?? 0)
  const activeDebts: Array<{ id: string; title: string; status: string; current_balance: number; interest_rate: number | null; minimum_payment: number; extra_monthly: number }> = (debts ?? []).map((d: Record<string, unknown>) => ({
    id: String(d.id),
    title: String(d.title),
    status: 'active',
    current_balance: num(d.current_balance),
    interest_rate: d.interest_rate == null ? null : num(d.interest_rate),
    minimum_payment: num(d.minimum_payment),
    extra_monthly: num(d.extra_monthly),
  }))

  const householdUsers = (users ?? []).map((u: { id: string; monthly_income: number | null }) => ({
    id: String(u.id),
    monthly_income: u.monthly_income == null ? null : num(u.monthly_income),
  }))
  const goalRows = (goals ?? []) as Array<Record<string, unknown>>
  const budgetInput: BudgetInput = {
    userIncomes: householdUsers.map((u: { monthly_income: number | null }) => u.monthly_income),
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
    hasActiveGoals: goalRows.some((g) => !g.is_cushion),
    cushionBalance: goalRows.filter((g) => g.is_cushion).reduce((s, g) => s + num(g.current_amount), 0),
    settings,
    categoryNames: Object.fromEntries((categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name])),
    categoryNeedKinds: Object.fromEntries((categories ?? []).map((c: { id: string; need_kind: 'need' | 'want' | null }) => [c.id, c.need_kind ?? null])),
    annualExpenses: (annual ?? []).map((a: { amount: number; saved: number; month: number }) => ({ amount: num(a.amount), saved: num(a.saved), month: Number(a.month) })),
    currencySymbol: CURRENCY_SYMBOLS[currency] ?? currency,
    today,
  }
  const budget = computeBudget(budgetInput)

  const snapshotDebts: SnapshotDebt[] = activeDebts.map((d) => ({
    id: d.id,
    title: d.title,
    balance: d.current_balance,
    rate: d.interest_rate,
    min_payment: d.minimum_payment,
    extra_monthly: d.extra_monthly,
  }))

  return {
    currency,
    budget,
    budgetInput,
    users: householdUsers,
    debts: snapshotDebts,
    totalDebt: snapshotDebts.reduce((s, d) => s + d.balance, 0),
    debtFreeDate: budget.plan.debtFreeDate,
    goals: goalRows.filter((g) => !g.is_cushion).map((g) => ({
      title: String(g.title),
      target: num(g.target_amount),
      current: num(g.current_amount),
      target_date: (g.target_date as string | null) ?? null,
    })),
    categoryNames: (categories ?? []).map((c: { name: string }) => c.name),
    budgetModel: (['50_30_20', 'zero_based', 'pay_yourself_first'].includes(settingsRow?.budget_model) ? settingsRow.budget_model : '50_30_20') as BudgetModelId,
    pause: {
      threshold: settingsRow?.pause_threshold == null ? null : Number(settingsRow.pause_threshold),
      hours: Number(settingsRow?.pause_hours ?? 24),
    },
  }
}

const INCOME_SOURCE: Record<Budget['incomeSource'], string> = {
  settings: 'из настроек',
  this_month: 'поступления этого месяца',
  last_month: 'поступления прошлого месяца — зарплату этого месяца ещё не записали',
  none: 'не указан',
}

const MODE_TEXT: Record<PlanSettings['mode'], string> = {
  debts_first: 'сначала долги: всё сверх обычных трат — в долги, после них подушка, потом цели',
  cushion_first: 'сначала подушка: резерв на N месяцев расходов, потом долги (минимальные платежи идут всегда)',
  split: 'пополам: доля свободных денег в долги, остальное в накопления (подушка, потом цели)',
  ladder: 'по порядку: стартовая подушка на 1 месяц → долги со ставкой от порога → полная подушка → остальные долги → цели',
}
const STRATEGY_TEXT: Record<PlanSettings['strategy'], string> = {
  avalanche: 'лавина — сначала самая высокая ставка (минимальная переплата)',
  snowball: 'снежный ком — сначала самый маленький остаток (быстрые закрытия)',
  cash_flow: 'поток (Cash Flow Index) — сначала наименьшее отношение остатка к минимальному платежу (быстрее освобождает деньги в месяц)',
}

export function snapshotToPrompt(s: FinancialSnapshot): string {
  const b = s.budget
  const p = b.plan
  const st = b.settings
  const r = (n: number) => Math.round(n)
  const modeDetails =
    st.mode === 'split' ? ` (${st.splitDebtPct}% в долги)` : st.mode === 'ladder' ? ` (дорогие долги — от ${st.highRateThreshold}%)` : ''
  return [
    `Валюта всех сумм ниже: ${s.currency}. ${currencyInstruction(s.currency)}`,
    `Настройки семьи. Режим: ${MODE_TEXT[st.mode]}${modeDetails}. Подушка: ${st.cushionMonths} мес. расходов = ${r(p.cushionTarget)}, накоплено ${r(b.cushionBalance)}. Порядок погашения: ${STRATEGY_TEXT[st.strategy]}. Минимальный платёж закрытого долга переходит в следующий.`,
    `Доход в месяц: ${r(b.income)} (${INCOME_SOURCE[b.incomeSource]}).`,
    `Обычные траты в месяц: ${r(b.typicalSpend)} (${b.historyMonths ? `среднее за ${b.historyMonths} мес.` : 'первый месяц — оценка по текущему темпу, истории ещё нет'}).`,
    `Минимальные платежи по долгам: ${r(b.minPayments)} в месяц.${b.annualReserve > 0 ? ` Резерв под крупные траты года: ${r(b.annualReserve)} в месяц.` : ''} Сверх обычных трат и минимумов: ${r(b.planExtra)} в месяц; в этом месяце по плану — в долги ${r(p.now.toDebts)}, в подушку ${r(p.now.toCushion)}, на цели ${r(p.now.toGoals)}.`,
    `${b.settings.periodStartDay == null ? 'Этот месяц' : `Бюджетный месяц с ${b.periodStart} по ${b.periodEnd} (от дня зарплаты)`} (день ${b.dayOfMonth} из ${b.daysInMonth}, осталось ${b.daysLeft} дн.): потрачено ${r(b.spent)}; по долгам внесено ${r(b.debtPaid)}; ещё отложить по плану ${r(b.reserved)}; бюджет на траты ${r(b.limit)}; свободно до конца месяца ${r(b.available)} (≈${r(b.perDay)} в день).`,
    b.expectedByNow != null ? `Обычно к этому дню месяца потрачено: ${r(b.expectedByNow)}.` : '',
    `Траты этого месяца по категориям: ${b.categories.map((c) => `${c.name}=${r(c.amount)}${c.typical != null ? ` (обычно за месяц ${r(c.typical)})` : ''}`).join(', ') || '—'}.`,
    assessMonth(s.budgetInput, s.budgetModel).note,
    `Перерасход и аномалии: ${b.signals.length ? b.signals.map((x) => x.text).join(' ') : 'не найдено'}`,
    `Долги: ${s.debts.map((d) => `${d.title} (остаток ${r(d.balance)}, ${d.rate ?? 0}%, мин. платёж ${r(d.min_payment)}${d.extra_monthly > 0 ? `, сверх него вносят ${r(d.extra_monthly)} в месяц` : ''})`).join('; ') || 'нет'}. Общий долг: ${r(s.totalDebt)}.`,
    p.hasDebts
      ? `План по текущим настройкам: ${p.closures.map((c) => `${c.title} закроется ${c.date}`).join(', ') || 'долги не закрываются'}; все долги — ${p.debtFreeDate ?? 'не закроются за 50 лет'}; переплата по процентам ${r(p.totalInterest)}.`
      : '',
    `Подушка наберётся: ${p.cushionFullDate ?? 'не наберётся при таких деньгах'}. Деньги на цели пойдут ${p.goalsStartDate ? `с ${p.goalsStartDate}, ${r(p.goalsMonthly)} в месяц` : 'нескоро — сейчас всё уходит в долги и подушку'}.`,
    `Цели: ${s.goals.map((g) => `${g.title} (${r(g.current)}/${r(g.target)}${g.target_date ? `, срок ${g.target_date}` : ''})`).join('; ') || 'нет'}.`,
  ]
    .filter(Boolean)
    .join('\n')
}
