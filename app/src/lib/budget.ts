// Единая модель денег семьи. Из неё берут цифры «Обзор», план долгов, цели,
// инсайты — и ИИ: supabase/functions/_shared/budget.ts — побайтовая копия
// этого файла (без импортов, чтобы копия работала и в Deno). Меняешь здесь —
// копируй туда.
//
// Порядок денег за месяц:
//   доход → минимальные платежи → досрочное погашение долгов (всё, что сверх
//   обычных трат) → бюджет на траты.
// Цели получают свободные деньги только когда долгов не осталось.
//
// «Обычные траты» — среднее за до 3 прошлых полных месяцев. Пока истории нет
// (первый месяц), это прогноз по текущему темпу — бюджет «плавает» вместе
// с тратами, перерасход не ищется, план помечен как оценка.

export interface BudgetExpense {
  id: string
  amount: number
  spent_at: string
  is_confirmed: boolean
  category_id: string | null
  merchant?: string | null
  description?: string | null
}

export interface BudgetInput {
  /** users.monthly_income каждого члена семьи — доход семьи это их сумма. */
  userIncomes: Array<number | null | undefined>
  incomes: Array<{ amount: number; received_at: string }>
  expenses: BudgetExpense[]
  debts: Array<{ id: string; status: string; minimum_payment: number; current_balance: number }>
  debtPayments: Array<{ debt_id: string; amount: number; paid_at: string }>
  hasActiveGoals: boolean
  categoryNames: Record<string, string>
  currencySymbol: string
  today?: Date
}

export type BudgetSignal =
  | { kind: 'category'; categoryId: string; amount: number; text: string }
  | { kind: 'pace'; amount: number; text: string }
  | { kind: 'anomaly'; expenseId: string; categoryId: string; amount: number; text: string }
  | { kind: 'new_category'; categoryId: string; amount: number; text: string }

export interface BudgetCategory {
  id: string
  name: string
  amount: number
  /** Обычно за месяц; null — истории нет. */
  typical: number | null
  /** Обычно к сегодняшнему числу; null — истории нет. */
  expectedByNow: number | null
}

export interface Budget {
  income: number
  incomeSource: 'settings' | 'this_month' | 'last_month' | 'none'
  hasIncome: boolean

  /** Сколько прошлых полных месяцев легло в «обычные траты»; 0 — первый месяц, всё оценка. */
  historyMonths: number
  typicalSpend: number
  minPayments: number
  /** Доход − минимальные платежи − обычные траты. Может быть < 0. */
  freeMonthly: number
  /** Сколько каждый месяц уходит сверх минимумов: в долги, пока они есть, потом в цели. */
  planExtra: number
  planTarget: 'debts' | 'goals' | 'none'

  dayOfMonth: number
  daysInMonth: number
  daysLeft: number
  spent: number
  /** Внесено по долгам в этом месяце (минимумы и досрочно). */
  debtPaid: number
  /** Ещё отложить в этом месяце: невнесённые минимумы + невнесённая часть planExtra. */
  reserved: number
  /** debtPaid + reserved — всё, что в этом месяце уходит не на траты. */
  obligations: number
  /** Бюджет на траты: income − obligations. */
  limit: number
  available: number
  perDay: number
  /** Обычно потрачено к сегодняшнему числу; null — истории нет. */
  expectedByNow: number | null
  categories: BudgetCategory[]
  /** Перерасход и аномалии, самое важное первым. */
  signals: BudgetSignal[]
}

const UNCATEGORIZED = 'uncategorized'

function ymd(iso: string) {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) }
}

function monthIndex(y: number, m: number) {
  return y * 12 + m
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeBudget(input: BudgetInput): Budget {
  const today = input.today ?? new Date()
  const current = monthIndex(today.getFullYear(), today.getMonth())
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - dayOfMonth + 1
  const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${input.currencySymbol}`

  // ── Доход ──────────────────────────────────────────────────────────────
  const settingsIncome = input.userIncomes.reduce<number>((s, v) => s + (v ?? 0), 0)
  const incomeIn = (idx: number) =>
    input.incomes.filter((i) => { const p = ymd(i.received_at); return monthIndex(p.y, p.m) === idx }).reduce((s, i) => s + i.amount, 0)
  const thisMonthIncome = incomeIn(current)
  const lastMonthIncome = incomeIn(current - 1)
  const [income, incomeSource]: [number, Budget['incomeSource']] =
    settingsIncome > 0 ? [settingsIncome, 'settings']
    : thisMonthIncome > 0 ? [thisMonthIncome, 'this_month']
    : lastMonthIncome > 0 ? [lastMonthIncome, 'last_month']
    : [0, 'none']

  // ── История трат ───────────────────────────────────────────────────────
  const confirmed = input.expenses.filter((e) => e.is_confirmed)
  const withPos = confirmed.map((e) => { const p = ymd(e.spent_at); return { e, idx: monthIndex(p.y, p.m), day: p.d, cat: e.category_id ?? UNCATEGORIZED } })
  const thisMonth = withPos.filter((x) => x.idx === current)
  const past = withPos.filter((x) => x.idx < current)

  // Месяц истории считается, если он полный: либо после месяца первой траты,
  // либо сам первый, но записи в нём начались не позже 5-го числа.
  const firstPast = past.reduce<{ idx: number; day: number } | null>(
    (min, x) => (!min || x.idx < min.idx || (x.idx === min.idx && x.day < min.day) ? { idx: x.idx, day: x.day } : min),
    null,
  )
  const historyIdx: number[] = []
  if (firstPast) {
    for (let idx = current - 1; idx >= Math.max(firstPast.idx, current - 3); idx--) {
      if (idx > firstPast.idx || firstPast.day <= 5) historyIdx.push(idx)
    }
  }
  const history = past.filter((x) => historyIdx.includes(x.idx))
  const historyMonths = historyIdx.length

  const spent = thisMonth.reduce((s, x) => s + x.e.amount, 0)
  const avgOver = (rows: typeof history, byDay: number | null) =>
    historyMonths ? rows.filter((x) => byDay == null || x.day <= byDay).reduce((s, x) => s + x.e.amount, 0) / historyMonths : 0

  const typicalSpend = historyMonths
    ? avgOver(history, null)
    // Первый месяц: прогноз по темпу. Делитель не меньше 14 дней, чтобы
    // аренда 5-го числа не превращалась в «траты ×6 до конца месяца».
    : Math.max(spent, (spent / Math.max(dayOfMonth, 14)) * daysInMonth)
  const expectedByNow = historyMonths ? avgOver(history, dayOfMonth) : null

  // ── Долги и план ───────────────────────────────────────────────────────
  // Нулевой остаток — долг закрыт, даже если статус ещё не успел смениться.
  const activeDebts = input.debts.filter((d) => d.status === 'active' && d.current_balance > 0)
  const minPayments = activeDebts.reduce((s, d) => s + d.minimum_payment, 0)
  const freeMonthly = income - minPayments - typicalSpend
  const planTarget: Budget['planTarget'] = activeDebts.length ? 'debts' : input.hasActiveGoals ? 'goals' : 'none'
  const planExtra = planTarget === 'none' ? 0 : Math.max(0, Math.floor(freeMonthly / 1000) * 1000)

  const paidThisMonth = new Map<string, number>()
  for (const p of input.debtPayments) {
    const pos = ymd(p.paid_at)
    if (monthIndex(pos.y, pos.m) === current) paidThisMonth.set(p.debt_id, (paidThisMonth.get(p.debt_id) ?? 0) + p.amount)
  }
  const debtPaid = [...paidThisMonth.values()].reduce((s, v) => s + v, 0)
  const unpaidMins = activeDebts.reduce((s, d) => s + Math.max(0, d.minimum_payment - (paidThisMonth.get(d.id) ?? 0)), 0)
  const extraPaid = activeDebts.reduce((s, d) => s + Math.max(0, (paidThisMonth.get(d.id) ?? 0) - d.minimum_payment), 0)
  const remainingDebt = activeDebts.reduce((s, d) => s + d.current_balance, 0)
  const reserved =
    planTarget === 'debts'
      ? Math.min(remainingDebt, unpaidMins + Math.max(0, planExtra - extraPaid))
      : unpaidMins + planExtra

  const obligations = debtPaid + reserved
  const limit = income - obligations
  const available = limit - spent
  const perDay = daysLeft > 0 ? Math.floor(available / daysLeft / 10) * 10 : available

  // ── Категории ──────────────────────────────────────────────────────────
  const nameOf = (id: string) => input.categoryNames[id] ?? 'Без категории'
  const catIds = new Set(thisMonth.map((x) => x.cat))
  const categories: BudgetCategory[] = [...catIds]
    .map((id) => {
      const rows = history.filter((x) => x.cat === id)
      return {
        id,
        name: nameOf(id),
        amount: thisMonth.filter((x) => x.cat === id).reduce((s, x) => s + x.e.amount, 0),
        typical: historyMonths ? avgOver(rows, null) : null,
        expectedByNow: historyMonths ? avgOver(rows, dayOfMonth) : null,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  // ── Сигналы: перерасход и аномалии ─────────────────────────────────────
  const signals: BudgetSignal[] = []
  if (historyMonths) {
    const minAmount = Math.max(5000, Math.round(typicalSpend * 0.03))
    const whereTo = planTarget === 'debts' ? ' — это деньги, которые ушли бы в долги' : ''

    for (const c of categories) {
      if (c.typical == null || c.expectedByNow == null || c.typical === 0) continue
      const over = c.amount - c.expectedByNow
      if (over >= minAmount && c.amount > c.expectedByNow * 1.3) {
        signals.push({
          kind: 'category',
          categoryId: c.id,
          amount: over,
          text: `«${c.name}»: ${money(c.amount)}, обычно к ${dayOfMonth}-му числу ${money(c.expectedByNow)}. Сверх обычного ${money(over)}${whereTo}.`,
        })
      }
    }

    if (expectedByNow != null && dayOfMonth >= 3) {
      const over = spent - expectedByNow
      if (over >= minAmount && spent > expectedByNow * 1.15) {
        signals.push({
          kind: 'pace',
          amount: over,
          text: `Потрачено ${money(spent)}, обычно к ${dayOfMonth}-му числу ${money(expectedByNow)}. Сверх обычного ${money(over)}${whereTo}.`,
        })
      }
    }

    for (const x of thisMonth) {
      const pastAmounts = history.filter((h) => h.cat === x.cat).map((h) => h.e.amount)
      if (pastAmounts.length < 3) continue
      const usual = median(pastAmounts)
      if (x.e.amount >= minAmount && x.e.amount >= usual * 3) {
        const where = x.e.merchant ? ` (${x.e.merchant})` : ''
        signals.push({
          kind: 'anomaly',
          expenseId: x.e.id,
          categoryId: x.cat,
          amount: x.e.amount,
          text: `Трата ${money(x.e.amount)} в «${nameOf(x.cat)}»${where} — обычно там около ${money(usual)}. Проверь, не ошибка ли.`,
        })
      }
    }

    for (const c of categories) {
      if (c.typical === 0 && c.amount >= Math.max(minAmount, typicalSpend * 0.1)) {
        signals.push({
          kind: 'new_category',
          categoryId: c.id,
          amount: c.amount,
          text: `Новая статья: «${c.name}» — ${money(c.amount)} в этом месяце, раньше таких трат не было.`,
        })
      }
    }
  }
  const order: BudgetSignal['kind'][] = ['category', 'pace', 'anomaly', 'new_category']
  signals.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.amount - a.amount)

  return {
    income,
    incomeSource,
    hasIncome: income > 0,
    historyMonths,
    typicalSpend,
    minPayments,
    freeMonthly,
    planExtra,
    planTarget,
    dayOfMonth,
    daysInMonth,
    daysLeft,
    spent,
    debtPaid,
    reserved,
    obligations,
    limit,
    available,
    perDay,
    expectedByNow,
    categories,
    signals,
  }
}
