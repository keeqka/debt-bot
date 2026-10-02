// ТЗ §7.7: AI advisor chat. The financial snapshot is re-attached to every
// call (not "remembered" by the model across turns) so it never goes stale.
//
// Client tools the model can reach for — this is what makes it an assistant
// for the whole app, not just a Q&A box:
//  - model_purchase_impact — "могу ли я купить MacBook за X?" gets a computed
//    projection instead of a guess; the frontend renders it as a card.
//  - propose_debt — "запиши мне долг перед Kaspi на 350 000" gets turned into
//    a pre-filled "Новый долг" form for the user to review and save
//    themselves. The model NEVER writes to the database directly — same
//    confirm-before-save rule as receipts and the screenshot debt-assist.
//  - propose_category — "добавь категорию Подписки" gets a one-tap confirm
//    card (no form: unlike a debt there's nothing here worth reviewing).
//  - propose_settings_change — money model, debt strategy, cushion, income,
//    reminders; the card shows before/after computed by rerunning the budget,
//    applied only on tap.
//  - simulate_debt_scenarios — strategy comparisons and "what if" runs on the
//    same planner the app uses; the model explains numbers, never invents them.
// web_search is also available (server-side, no client handling needed) so
// the advisor isn't limited to what's in the database for general questions.

import { handleOptions, jsonResponse, jsonError } from '../_shared/cors.ts'
import { requireSession } from '../_shared/auth.ts'
import { callClaudeRaw, CLAUDE_MODEL_DEFAULT, WEB_SEARCH_TOOL, type ClaudeMessage } from '../_shared/claude.ts'
import { getUserClient } from '../_shared/supabase-admin.ts'
import { buildFinancialSnapshot, snapshotToPrompt, type FinancialSnapshot } from '../_shared/finance-context.ts'
import { computeBudget, orderDebts, simulatePlan, type DebtStrategy, type PlanDebt, type PlanSettings } from '../_shared/budget.ts'
import { PERSONA } from '../_shared/persona.ts'

const PURCHASE_IMPACT_TOOL = {
  name: 'model_purchase_impact',
  description: 'Checks a hypothetical purchase against this month\'s budget and the debt payoff plan (debts come first) — returns whether it fits and how far the debt-free date would move.',
  input_schema: {
    type: 'object',
    properties: {
      item_name: { type: 'string' },
      amount: { type: 'number' },
      payment_type: { type: 'string', enum: ['one_time', 'installments'] },
      installment_months: { type: 'number' },
    },
    required: ['item_name', 'amount', 'payment_type'],
  },
}

const PROPOSE_DEBT_TOOL = {
  name: 'propose_debt',
  description:
    'Propose creating a new debt from what the user described in chat. This never saves anything — the app shows the user an editable form with these values to confirm before it is actually added.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      creditor: { type: 'string' },
      principal_amount: { type: ['number', 'null'] },
      current_balance: { type: ['number', 'null'] },
      interest_rate: { type: ['number', 'null'] },
      minimum_payment: { type: ['number', 'null'] },
      due_day: { type: ['number', 'null'] },
      confirmation_text: { type: 'string', description: 'по-русски: короткая фраза с просьбой проверить и подтвердить в форме' },
    },
    required: ['title', 'creditor', 'confirmation_text'],
  },
}

const PROPOSE_CATEGORY_TOOL = {
  name: 'propose_category',
  description:
    'Propose creating a new expense/income category the user asked for in chat ("добавь категорию Подписки"). Shown as a one-tap confirm in the bubble — nothing is created until the user taps it.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['expense', 'income'] },
      confirmation_text: { type: 'string', description: 'по-русски: короткая фраза с предложением добавить эту категорию' },
    },
    required: ['name', 'type', 'confirmation_text'],
  },
}

const PROPOSE_SETTINGS_TOOL = {
  name: 'propose_settings_change',
  description:
    'Propose changing the app settings the user asked about (money model, debt strategy, cushion size, split, income, payday, reminders). Nothing changes until the user taps «Применить»; the card shows the recomputed consequences.',
  input_schema: {
    type: 'object',
    properties: {
      changes: {
        type: 'object',
        properties: {
          priority_mode: { type: 'string', enum: ['debts_first', 'cushion_first', 'split', 'ladder'] },
          debt_strategy: { type: 'string', enum: ['avalanche', 'snowball', 'cash_flow'] },
          cushion_months: { type: 'number', description: '1-12' },
          split_debt_pct: { type: 'number', description: '0-100, доля свободных денег в долги (режим split)' },
          high_rate_threshold: { type: 'number', description: '% годовых, с которого долг считается дорогим (режим ladder)' },
          period_start_day: { type: ['number', 'null'], description: 'с какого числа (1-31) начинается бюджетный месяц, обычно день зарплаты; null — календарный месяц' },
          monthly_income: { type: ['number', 'null'], description: 'доход в месяц автора сообщения' },
          payday: { type: ['number', 'null'], description: '1-31' },
          daily_reminder_enabled: { type: 'boolean' },
          daily_reminder_time: { type: 'string', description: 'HH:MM' },
        },
      },
      confirmation_text: { type: 'string', description: 'по-русски, голосом «Чека»: что меняется и главное последствие, одно-два предложения' },
    },
    required: ['changes', 'confirmation_text'],
  },
}

const SIMULATE_SCENARIOS_TOOL = {
  name: 'simulate_debt_scenarios',
  description:
    'Computes the debt payoff plan for all three strategies (avalanche, snowball, cash_flow) on current money and on a scenario: more/less per month, a one-off lump sum, refinancing a debt at a new rate, or a different money mode. Returns dates, total interest, closing order, and a minimums-only baseline. Use for any question about strategies, "what if", "how to close faster", refinancing.',
  input_schema: {
    type: 'object',
    properties: {
      extra_per_month_delta: { type: 'number', description: 'на сколько больше (или меньше, отрицательное) вносить в месяц сверх текущего плана' },
      lump_sum: { type: 'number', description: 'разовая сумма в долги прямо сейчас' },
      refinance: {
        type: 'array',
        items: {
          type: 'object',
          properties: { debt_title: { type: 'string' }, new_rate: { type: 'number' }, new_min_payment: { type: 'number' } },
          required: ['debt_title', 'new_rate'],
        },
      },
      mode: { type: 'string', enum: ['debts_first', 'cushion_first', 'split', 'ladder'] },
    },
  },
}

const LIST_CATEGORY_EXPENSES_TOOL = {
  name: 'list_category_expenses',
  description:
    'Returns the actual transactions (merchant, amount, date) behind a category\'s total for this month. The snapshot only has category totals, not what makes them up — use this whenever asked WHY a category is big/small or WHAT is in it, instead of guessing from the number.',
  input_schema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Category name exactly as it appears in "Траты этого месяца по категориям", e.g. "Прочее"' },
    },
    required: ['category'],
  },
}

const DATA_WIDGET_TOOL = {
  name: 'render_data_widget',
  description:
    'Renders a numeric breakdown (e.g. spending by category, income vs expense) as a data card on paper instead of writing percentages out in text. Use for "how much do I spend on X" / "break down Y" style questions.',
  input_schema: {
    type: 'object',
    properties: {
      caption: { type: 'string', description: 'по-русски, 1 короткое предложение перед виджетом' },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            pct: { type: 'number', description: '0-100, доля от суммы всех строк' },
          },
          required: ['name', 'amount', 'pct'],
        },
      },
    },
    required: ['rows'],
  },
}

const SUGGEST_FOLLOWUPS_TOOL = {
  name: 'suggest_followups',
  description: '2-3 короткие вопроса, которые пользователь мог бы задать следующими, исходя из твоего последнего ответа.',
  input_schema: {
    type: 'object',
    properties: {
      replies: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
    },
    required: ['replies'],
  },
}

const ALL_TOOLS = [
  PURCHASE_IMPACT_TOOL,
  SIMULATE_SCENARIOS_TOOL,
  PROPOSE_SETTINGS_TOOL,
  PROPOSE_DEBT_TOOL,
  PROPOSE_CATEGORY_TOOL,
  LIST_CATEGORY_EXPENSES_TOOL,
  DATA_WIDGET_TOOL,
  SUGGEST_FOLLOWUPS_TOOL,
  WEB_SEARCH_TOOL,
]

function monthsBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

function planDebts(snapshot: FinancialSnapshot): PlanDebt[] {
  return snapshot.debts.map((d) => ({ id: d.id, title: d.title, balance: d.balance, rate: d.rate, min: d.min_payment }))
}

/** The household plan with some inputs swapped — same simulation the app runs (_shared/budget.ts). */
function planWith(
  snapshot: FinancialSnapshot,
  o: { monthlyExtra?: number; settings?: Partial<PlanSettings>; debts?: PlanDebt[]; rollover?: boolean } = {},
) {
  const b = snapshot.budget
  return simulatePlan({
    debts: o.debts ?? planDebts(snapshot),
    monthlyExtra: o.monthlyExtra ?? b.planExtra,
    settings: { ...b.settings, ...o.settings },
    cushionBalance: b.cushionBalance,
    monthlyNeed: b.monthlyNeed,
    start: snapshot.budgetInput.today ?? new Date(),
    rollover: o.rollover,
  })
}

const STRATEGIES: DebtStrategy[] = ['avalanche', 'snowball', 'cash_flow']

/**
 * Debt strategy talk grounded in arithmetic: every number the model quotes
 * about "what if" comes from here, never from its own head. Runs all three
 * strategies on the current money and on the scenario (more/less per month,
 * a one-off lump sum, a refinanced debt), plus a minimums-only baseline.
 */
function simulateScenarios(
  input: {
    extra_per_month_delta?: number
    lump_sum?: number
    refinance?: Array<{ debt_title: string; new_rate: number; new_min_payment?: number }>
    mode?: PlanSettings['mode']
  },
  snapshot: FinancialSnapshot,
) {
  const b = snapshot.budget
  const r = (n: number) => Math.round(n)
  let debts = planDebts(snapshot)
  const notes: string[] = []

  for (const rf of input.refinance ?? []) {
    const target = debts.find((d) => d.title.toLowerCase().includes(rf.debt_title.toLowerCase()))
    if (!target) {
      notes.push(`Долг «${rf.debt_title}» не найден — рефинансирование не учтено.`)
      continue
    }
    debts = debts.map((d) => (d.id === target.id ? { ...d, rate: rf.new_rate, min: rf.new_min_payment ?? d.min } : d))
  }

  const describe = (strategy: DebtStrategy, extra: number, list: PlanDebt[]) => {
    const p = planWith(snapshot, { monthlyExtra: extra, debts: list, settings: { strategy, ...(input.mode ? { mode: input.mode } : {}) } })
    return {
      debt_free_date: p.debtFreeDate,
      months: p.debtFreeMonths,
      total_interest: p.totalInterest,
      closing_order: p.closures.map((c) => `${c.title} — ${c.date}`),
      cushion_full_date: p.cushionFullDate,
    }
  }

  const withLump = (strategy: DebtStrategy) => {
    let left = Math.max(0, input.lump_sum ?? 0)
    return orderDebts(debts, strategy).map((d) => {
      const pay = Math.min(left, d.balance)
      left -= pay
      return { ...d, balance: d.balance - pay }
    })
  }

  const scenarioExtra = Math.max(0, b.planExtra + (input.extra_per_month_delta ?? 0))
  const current = Object.fromEntries(STRATEGIES.map((st) => [st, describe(st, b.planExtra, planDebts(snapshot))]))
  const scenario = Object.fromEntries(STRATEGIES.map((st) => [st, describe(st, scenarioExtra, withLump(st))]))
  const minimumsOnly = planWith(snapshot, { monthlyExtra: 0, rollover: false })

  return {
    selected_strategy: b.settings.strategy,
    selected_mode: input.mode ?? b.settings.mode,
    extra_per_month_now: r(b.planExtra),
    extra_per_month_scenario: r(scenarioExtra),
    lump_sum: r(input.lump_sum ?? 0),
    current_by_strategy: current,
    scenario_by_strategy: scenario,
    minimums_only: { debt_free_date: minimumsOnly.debtFreeDate, total_interest: minimumsOnly.totalInterest },
    notes,
  }
}

type SettingsChange = {
  priority_mode?: PlanSettings['mode']
  debt_strategy?: DebtStrategy
  cushion_months?: number
  split_debt_pct?: number
  high_rate_threshold?: number
  period_start_day?: number | null
  monthly_income?: number | null
  payday?: number | null
  daily_reminder_enabled?: boolean
  daily_reminder_time?: string
}

/**
 * A settings change the model proposed, split into household vs the sender's
 * own user fields, with its consequences computed by rerunning the whole
 * budget on the changed inputs — so the card shows real before/after numbers.
 */
function buildSettingsProposal(changes: SettingsChange, snapshot: FinancialSnapshot, userId: string) {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
  const household: Record<string, unknown> = {}
  if (changes.priority_mode) household.priority_mode = changes.priority_mode
  if (changes.debt_strategy) household.debt_strategy = changes.debt_strategy
  if (changes.cushion_months != null) household.cushion_months = clamp(changes.cushion_months, 1, 12)
  if (changes.split_debt_pct != null) household.split_debt_pct = Math.round(clamp(changes.split_debt_pct, 0, 100))
  if (changes.high_rate_threshold != null) household.high_rate_threshold = clamp(changes.high_rate_threshold, 0, 100)
  if (changes.period_start_day !== undefined) household.period_start_day = changes.period_start_day == null ? null : Math.round(clamp(changes.period_start_day, 1, 31))

  const user: Record<string, unknown> = {}
  if (changes.monthly_income !== undefined) user.monthly_income = changes.monthly_income
  if (changes.payday !== undefined) user.payday = changes.payday == null ? null : Math.round(clamp(changes.payday, 1, 31))
  if (changes.daily_reminder_enabled !== undefined) user.daily_reminder_enabled = changes.daily_reminder_enabled
  if (changes.daily_reminder_time) user.daily_reminder_time = changes.daily_reminder_time

  const before = snapshot.budget
  const after = computeBudget({
    ...snapshot.budgetInput,
    userIncomes:
      user.monthly_income !== undefined
        ? snapshot.users.map((u) => (u.id === userId ? (user.monthly_income as number | null) : u.monthly_income))
        : snapshot.budgetInput.userIncomes,
    settings: {
      ...before.settings,
      ...(household.priority_mode ? { mode: household.priority_mode as PlanSettings['mode'] } : {}),
      ...(household.debt_strategy ? { strategy: household.debt_strategy as DebtStrategy } : {}),
      ...(household.cushion_months != null ? { cushionMonths: household.cushion_months as number } : {}),
      ...(household.split_debt_pct != null ? { splitDebtPct: household.split_debt_pct as number } : {}),
      ...(household.high_rate_threshold != null ? { highRateThreshold: household.high_rate_threshold as number } : {}),
      ...(household.period_start_day !== undefined ? { periodStartDay: household.period_start_day as number | null } : {}),
    },
  })

  return {
    ...(Object.keys(household).length ? { household } : {}),
    ...(Object.keys(user).length ? { user, user_id: userId } : {}),
    preview: {
      debt_free_before: before.plan.debtFreeDate,
      debt_free_after: after.plan.debtFreeDate,
      interest_before: before.plan.totalInterest,
      interest_after: after.plan.totalInterest,
      cushion_full_before: before.plan.cushionFullDate,
      cushion_full_after: after.plan.cushionFullDate,
      per_day_before: before.perDay,
      per_day_after: after.perDay,
    },
  }
}

/**
 * "Могу ли я купить X" against the same budget the app shows (_shared/budget.ts):
 * a one-off purchase first has to fit this month's spending money; whatever
 * doesn't comes out of the money earmarked for debts (debts come first), so the
 * honest consequence is how far the debt-free date moves. Installments eat into
 * that monthly extra for their whole term — computed with the real simulation.
 */
function computePurchaseImpact(
  input: { item_name: string; amount: number; payment_type: 'one_time' | 'installments'; installment_months?: number },
  snapshot: FinancialSnapshot,
) {
  const b = snapshot.budget
  const cur = snapshot.currency
  const r = (n: number) => Math.round(n)
  const free = Math.max(0, b.available)
  const base = { available_this_month: r(b.available), plan_extra_per_month: r(b.planExtra), plan_target: b.planTarget, debt_free_date: snapshot.debtFreeDate }

  if (input.payment_type === 'installments') {
    const months = Math.max(1, input.installment_months ?? 12)
    const monthly = input.amount / months
    // Верхняя оценка: платёж вычитается из свободных денег на весь горизонт плана.
    const newDebtFreeDate = snapshot.debts.length ? planWith(snapshot, { monthlyExtra: Math.max(0, b.planExtra - monthly) }).debtFreeDate : null
    const delay = snapshot.debtFreeDate && newDebtFreeDate ? monthsBetween(snapshot.debtFreeDate, newDebtFreeDate) : null
    return {
      ...base,
      monthly_payment: r(monthly),
      new_debt_free_date: newDebtFreeDate,
      debt_payoff_delay_months: delay,
      verdict:
        monthly > b.planExtra
          ? `Платёж ${r(monthly)} ${cur} в месяц больше, чем остаётся сверх обычных трат и минимальных платежей (${r(b.planExtra)}) — рассрочка уйдёт в минус.`
          : b.planTarget === 'debts'
            ? `Рассрочка заберёт ${r(monthly)} из ${r(b.planExtra)} ${cur} в месяц, которые сейчас идут в долги${delay ? ` — закрытие долгов сдвинется до ${delay} мес.` : '.'}`
            : `Влезает: ${r(monthly)} из ${r(b.planExtra)} ${cur} свободных в месяц.`,
    }
  }

  if (input.amount <= free) {
    const left = b.available - input.amount
    return {
      ...base,
      fits_this_month: true,
      available_after: r(left),
      per_day_after: b.daysLeft > 0 ? Math.floor(left / b.daysLeft / 10) * 10 : r(left),
      verdict: `Влезает в бюджет месяца: свободно ${r(b.available)} ${cur}, после покупки останется ${r(left)}.`,
    }
  }

  const shortfall = input.amount - free
  const monthsOfPlan = b.planExtra > 0 ? Math.ceil(shortfall / b.planExtra) : null
  return {
    ...base,
    fits_this_month: false,
    shortfall: r(shortfall),
    months_of_plan_extra: monthsOfPlan,
    verdict:
      monthsOfPlan == null
        ? `В бюджет месяца не влезает (свободно ${r(free)} ${cur}), а сверх обычных трат и минимальных платежей ничего не остаётся — покупка уйдёт в минус.`
        : b.planTarget === 'debts'
          ? `В бюджет месяца не влезает: свободно ${r(free)} ${cur}. Недостающие ${r(shortfall)} придётся взять из денег на долги — закрытие сдвинется примерно на ${monthsOfPlan} мес.`
          : `В бюджет месяца не влезает: свободно ${r(free)} ${cur}. Недостающие ${r(shortfall)} наберутся за ${monthsOfPlan} мес. свободных денег.`,
  }
}

/**
 * The transactions behind a category total — the snapshot text only ever has
 * the sum (finance-context.ts), so "why is X so high" needs the underlying
 * rows, already fetched into budgetInput.expenses for the budget calc.
 */
function listCategoryExpenses(input: { category: string }, snapshot: FinancialSnapshot) {
  const today = snapshot.budgetInput.today ?? new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const idOf = Object.entries(snapshot.budgetInput.categoryNames).find(
    ([, name]) => name.toLowerCase() === (input.category ?? '').trim().toLowerCase(),
  )?.[0]
  const rows = snapshot.budgetInput.expenses.filter((e) => {
    if (!e.is_confirmed) return false
    const y2 = Number(e.spent_at.slice(0, 4))
    const m2 = Number(e.spent_at.slice(5, 7)) - 1
    if (y2 !== y || m2 !== m) return false
    return idOf ? e.category_id === idOf : e.category_id == null
  })
  const sorted = [...rows].sort((a, b) => b.amount - a.amount)
  return {
    category: input.category,
    count: rows.length,
    total: Math.round(rows.reduce((s, r) => s + r.amount, 0)),
    transactions: sorted.slice(0, 30).map((r) => ({
      merchant: r.merchant || r.description || '—',
      amount: Math.round(r.amount),
      date: r.spent_at,
    })),
    truncated: rows.length > 30,
  }
}

type Mood = 'calm' | 'focused' | 'happy' | 'alert'
const MOOD_RE = /\[(calm|focused|happy|alert)\]/

function readMood(text: string): Mood | null {
  return (text.match(MOOD_RE)?.[1] as Mood | undefined) ?? null
}

function stripMood(text: string) {
  return text.replace(new RegExp(MOOD_RE.source, 'g'), '').trim()
}

/**
 * Chat history for the model. Assistant turns from before «Чек» had a voice
 * (no stored expression) are dropped — fed back as examples, the old neutral
 * replies pulled every new answer toward the same tone. Kept turns get their
 * mood marker back so the model keeps seeing the format it must follow.
 * Dropping turns can leave two user messages in a row, so same-role runs are
 * merged, and the thread must open with a user turn.
 */
function buildHistory(rows: Array<{ role: string; content: string; expression: string | null }>): ClaudeMessage[] {
  const kept = rows
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.expression))
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'assistant' ? `[${m.expression}]\n${m.content}` : m.content,
    }))
  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of kept) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) last.content += `\n\n${m.content}`
    else merged.push({ ...m })
  }
  while (merged.length && merged[0].role !== 'user') merged.shift()
  return merged
}

const MOOD_AND_EXAMPLES = `Лицо «Чека». Каждый ответ начинай с метки настроения на отдельной строке — пользователь её не видит, по ней меняется лицо маскота рядом с ответом:
[calm] — всё по плану, обычный ответ;
[alert] — перерасход, аномалия, риск, покупка не влезает, долг не закрывается;
[happy] — настоящая хорошая новость: долг закрыт, дата закрытия приблизилась, месяц в плане с запасом;
[focused] — разбираешь данные или предлагаешь действие (долг, категория).
Метка одна и только в начале. Хорошие новости не выдумывай ради [happy].

Как звучит «Чек» в чате. Цифры в примерах условные — бери только из данных выше.

Вопрос: «Привет»
[calm]
Привет. До конца месяца свободно 43 100 ₸ — это 10 770 в день. Показать, где тратится больше обычного?

Вопрос: «Где у меня перерасход?»
[alert]
«Здоровье»: 32 000 ₸, обычно к этому числу 13 500. Почти всё — одна трата в аптеке, раньше там было до 5 000. Если это ошибка распознавания — поправь в «Чеках», и 18 500 вернутся в план по долгам.

Вопрос: «Как быстрее закрыть долги?»
[calm]
Сейчас сверх минимумов в долги уходит 745 000 ₸ в месяц, всё закроется в декабре. Быстрее — только тратить меньше обычного: каждые 50 000 сверху приближают дату примерно на неделю. Первой гасится карта под 25% — она дороже всех.

Вопрос: «Я закрыл кредитку»
[happy]
Кредитка закрыта. 15 000 ₸ минимального платежа в месяц освободились — теперь они идут в кредит на авто. Запиши последний платёж во вкладке «План», чтобы план пересчитался.`

function findToolUse(blocks: Array<Record<string, unknown>>, name: string) {
  return blocks.find((b) => b.type === 'tool_use' && b.name === name) as { id: string; input: Record<string, unknown> } | undefined
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const session = await requireSession(req)
    const { content } = await req.json()
    if (!content) return jsonResponse({ error: 'content is required' }, 400)

    const supabase = getUserClient(req.headers.get('Authorization')!)
    await supabase.from('chat_messages').insert({ user_id: session.sub, role: 'user', content })

    // Most recent 20 — order-by-ascending-with-limit would instead grab the
    // OLDEST 20 and, once the thread outgrows that, silently drop the
    // message we just inserted. The array is reversed back to chronological
    // order afterward since that's what the Messages API expects.
    const { data: historyDesc } = await supabase
      .from('chat_messages')
      .select('role, content, expression')
      .order('created_at', { ascending: false })
      .limit(20)
    const history = (historyDesc ?? []).slice().reverse()

    const snapshot = await buildFinancialSnapshot(supabase)
    const categoryNames = snapshot.categoryNames.join(', ') || '—'
    const system = `${PERSONA}\n\nФорматирование: ответ рендерится в узком чат-пузыре в мессенджере, а не в документе. Можно **жирный** для ключевых цифр и короткие списки (-), если пунктов несколько. НЕ используй заголовки (#, ##, ###) — в пузыре они выглядят как сломанная вёрстка. Два-три коротких абзаца — норма.\n\nТекущее финансовое состояние:\n${snapshotToPrompt(snapshot)}\n\nТы — помощник по всему приложению, не только по разговору: можешь предлагать реальные действия (добавить долг, завести категорию, поменять настройки и модель денег семьи), а не только отвечать текстом.\n\nИнструменты:\n- Влияние конкретной покупки на бюджет — model_purchase_impact, а не оценка на глаз. Главное последствие — насколько сдвинется закрытие долгов.\n- Стратегии погашения, «что если», как закрыть быстрее, рефинансирование, сравнение режимов — сначала simulate_debt_scenarios, потом объясняй полученные цифры. Даты, переплату и порядок закрытия бери только из результата — никогда не считай в уме.\n- Про методы говори как есть: лавина экономит больше всего на процентах; снежный ком чаще закрывает долги (это мотивация, а не экономия); поток (Cash Flow Index) быстрее освобождает деньги в месяц; подушка защищает от новых долгов при потере дохода, но долги закрываются позже и переплата выше. Рефинансирование выгодно, только если новая ставка ниже с учётом комиссий — комиссии спроси, если их не назвали.\n- Просят поменять режим, стратегию, подушку, долю в долги, порог дорогого долга, доход, день зарплаты, напоминания — propose_settings_change. НИКОГДА не говори, что настройка уже изменена: она применится по кнопке «Применить». Спрашивают, какой режим выбрать, — посчитай варианты через simulate_debt_scenarios (параметр mode), назови плюсы и минусы и предложи одну смену карточкой.\n- Спрашивают, где перерасход, на что ушло больше обычного, нет ли странных трат — опирайся на блок «Перерасход и аномалии» и «обычно за месяц» по категориям; разбивку показывай через render_data_widget.\n- Спрашивают, ПОЧЕМУ конкретная категория такая большая/маленькая или что туда попало ("почему в Прочее так много", "что за траты в Транспорте") — список сумм в снапшоте не объясняет состав, сначала вызови list_category_expenses с этим названием категории и отвечай по реальным операциям (магазин, сумма, дата), а не догадками.\n- Просят добавить/записать/завести долг — propose_debt с лучшими известными полями (null, если что-то не названо). НИКОГДА не говори, что долг уже добавлен — он появится в форме на подтверждение.\n- Просят добавить/завести категорию расходов или доходов — propose_category. Уже существующие категории: ${categoryNames} — не предлагай дубликат, если похожая уже есть, скажи об этом вместо предложения. НИКОГДА не говори, что категория уже добавлена — она появится с кнопкой подтверждения.\n- Вопрос про разбивку по цифрам ("сколько я трачу на X", "на что уходят деньги") — render_data_widget, а не перечисление процентов текстом.\n- После содержательного ответа обычно вызывай suggest_followups с 2-3 короткими вопросами.\n- Веб-поиск — только для общих вопросов не про личные финансы пользователя (типичные цены, курсы). Если использовал — скажи об этом одной фразой.\n- Ты сам не принимаешь файлы и не добавляешь траты напрямую. Фото/PDF чека и PDF выписки грузятся на вкладке "Чеки", а боту в Telegram чек можно просто прислать. Если просят добавить траты — направь туда.\n\n${MOOD_AND_EXAMPLES}`

    const messages = buildHistory(history)

    const first = await callClaudeRaw({ system, messages, tools: ALL_TOOLS })

    let finalText = ''
    let proposedDebt: Record<string, unknown> | null = null
    let proposedCategory: Record<string, unknown> | null = null
    let proposedSettings: Record<string, unknown> | null = null
    let dataWidget: unknown[] | null = null
    // Which response to scan for suggest_followups — the second (post-tool-result)
    // turn when one happened, otherwise the first. Claude can emit multiple
    // tool_use blocks in one turn (tool_choice is "auto", not forced), so
    // suggest_followups can ride along with propose_debt/render_data_widget
    // directly, but model_purchase_impact needs its own round trip first.
    let followupSource = first.content
    let purchaseImpact: Record<string, unknown> | null = null

    // Compute tools (purchase check, strategy scenarios) need a second turn:
    // the model gets the real numbers back and only then writes the answer.
    // Every tool_use block of the first turn gets a tool_result — the API
    // rejects a turn where any of them is left unanswered.
    const computeNames = new Set(['model_purchase_impact', 'simulate_debt_scenarios', 'list_category_expenses'])
    const toolUses = first.content.filter((b) => b.type === 'tool_use') as Array<{ id: string; name: string; input: Record<string, unknown> }>
    const computed = first.stop_reason === 'tool_use' && toolUses.some((b) => computeNames.has(b.name))
    let turn = first.content
    if (computed) {
      const results = toolUses.map((b) => {
        let out: unknown = { ok: true }
        if (b.name === 'model_purchase_impact') {
          purchaseImpact = computePurchaseImpact(b.input as never, snapshot)
          out = purchaseImpact
        } else if (b.name === 'simulate_debt_scenarios') {
          out = simulateScenarios(b.input as never, snapshot)
        } else if (b.name === 'list_category_expenses') {
          out = listCategoryExpenses(b.input as never, snapshot)
        }
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) }
      })
      const second = await callClaudeRaw({
        system,
        tools: ALL_TOOLS,
        maxTokens: 1200,
        messages: [...messages, { role: 'assistant', content: first.content as never }, { role: 'user', content: results as never }],
      })
      turn = second.content
      followupSource = second.content
    }

    const turnText = turn
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim()
    const proposeDebtToolUse = findToolUse(turn, 'propose_debt')
    const proposeCategoryToolUse = findToolUse(turn, 'propose_category')
    const proposeSettingsToolUse = findToolUse(turn, 'propose_settings_change')
    const dataWidgetToolUse = findToolUse(turn, 'render_data_widget')

    // After a computation the explanation is the answer; a proposal's own
    // confirmation line is only the fallback. Without one, the tool's text is
    // the whole reply.
    const pick = (toolText: string | undefined) => (computed ? turnText || toolText || '' : toolText || turnText)

    if (proposeSettingsToolUse) {
      const { changes, confirmation_text } = proposeSettingsToolUse.input as { changes: SettingsChange; confirmation_text?: string }
      proposedSettings = buildSettingsProposal(changes ?? {}, snapshot, session.sub)
      finalText = pick(confirmation_text) || 'Поменять настройки? Посмотри, что изменится, и нажми «Применить».'
    } else if (proposeDebtToolUse) {
      const { confirmation_text, ...draft } = proposeDebtToolUse.input as Record<string, unknown> & { confirmation_text: string }
      finalText = pick(confirmation_text) || 'Проверь цифры и подтверди в форме — сам ничего не сохраняю.'
      proposedDebt = draft
    } else if (proposeCategoryToolUse) {
      const { confirmation_text, ...draft } = proposeCategoryToolUse.input as Record<string, unknown> & { confirmation_text: string }
      finalText = pick(confirmation_text) || 'Добавить такую категорию?'
      proposedCategory = draft
    } else if (dataWidgetToolUse) {
      const { caption, rows } = dataWidgetToolUse.input as { caption?: string; rows: unknown[] }
      finalText = pick(caption)
      dataWidget = rows
    } else {
      finalText = turnText || ((purchaseImpact as { verdict?: string } | null)?.verdict ?? '')
    }

    // The mood marker can sit in any text block of either turn (a tool-only
    // reply still usually opens with a one-line text block carrying it). After
    // a purchase check the second turn — written with the numbers — wins.
    const allText = [...(followupSource === first.content ? [] : followupSource), ...first.content]
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
    const expression =
      readMood(allText) ??
      (proposedDebt || proposedCategory || proposedSettings
        ? 'focused'
        : purchaseImpact && (purchaseImpact as { fits_this_month?: boolean }).fits_this_month === false
          ? 'alert'
          : 'calm')
    finalText = stripMood(finalText)

    const followupsToolUse = findToolUse(followupSource, 'suggest_followups')
    const quickReplies = (followupsToolUse?.input as { replies?: string[] } | undefined)?.replies ?? null

    const { data: saved, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: session.sub,
        role: 'assistant',
        content: finalText,
        context_snapshot: snapshot,
        model: CLAUDE_MODEL_DEFAULT,
        proposed_debt: proposedDebt,
        proposed_category: proposedCategory,
        proposed_settings: proposedSettings,
        data_widget: dataWidget,
        quick_replies: quickReplies,
        expression,
      })
      .select()
      .single()
    if (error) throw error

    return jsonResponse(saved)
  } catch (error) {
    return jsonError('Не удалось получить ответ', error)
  }
})
