// Единая модель денег семьи. Из неё берут цифры «Обзор», план долгов, цели,
// инсайты — и ИИ: supabase/functions/_shared/budget.ts — побайтовая копия
// этого файла (без импортов, чтобы копия работала и в Deno). Меняешь здесь —
// копируй туда.
//
// Порядок денег за месяц:
//   доход → минимальные платежи → всё, что сверх обычных трат, по плану
//   (долги / подушка / цели — как настроено, см. «План» ниже) → бюджет на траты.
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
  debts: Array<{ id: string; title: string; status: string; minimum_payment: number; /** Ежемесячный взнос сверх минимума — часть платежа по долгу. */ extra_monthly?: number; current_balance: number; interest_rate: number | null }>
  debtPayments: Array<{ debt_id: string; amount: number; paid_at: string }>
  hasActiveGoals: boolean
  /** Накоплено в подушке (цели с пометкой is_cushion). */
  cushionBalance: number
  settings: PlanSettings
  categoryNames: Record<string, string>
  /** Нужное / желание по id категории; нет записи или null — считается нужным (консервативно). */
  categoryNeedKinds?: Record<string, 'need' | 'want' | null>
  /** Крупные траты года: под них каждый месяц откладывается резерв (входит в обязательства). */
  annualExpenses?: Array<{ amount: number; saved: number; month: number }>
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
  /** Сколько каждый месяц уходит сверх минимумов — раскладку по долгам, подушке и целям даёт plan. */
  planExtra: number
  /** Куда уходит бо́льшая часть planExtra в этом месяце. */
  planTarget: 'debts' | 'cushion' | 'goals' | 'none'
  settings: PlanSettings
  plan: PlanResult
  /** Обычный месяц (обычные траты + минимумы) — в нём меряется подушка. */
  monthlyNeed: number
  cushionBalance: number

  /** День бюджетного месяца (с 1) — от 1-го числа или от дня зарплаты, смотря что выбрано. */
  dayOfMonth: number
  /** Длина текущего бюджетного месяца в днях. */
  daysInMonth: number
  daysLeft: number
  /** Границы текущего бюджетного месяца, ISO-даты, конец включительно. */
  periodStart: string
  periodEnd: string
  spent: number
  /** Внесено по долгам в этом месяце (минимумы и досрочно). */
  debtPaid: number
  /** Ещё отложить в этом месяце: невнесённые минимумы + невнесённая часть досрочных + подушка и цели по плану. */
  reserved: number
  /** debtPaid + reserved — всё, что в этом месяце уходит не на траты. */
  obligations: number
  /** Резерв в месяц под крупные траты года — часть obligations. */
  annualReserve: number
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

// ═══ План: куда идут деньги сверх обычных трат ═══════════════════════════
//
// Режимы — известные схемы личных финансов, не выдумка:
//   debts_first   всё свободное в долги; после — подушка, потом цели.
//   cushion_first сначала резерв на N месяцев обычных расходов, потом долги.
//   split         доля в долги, остальное в накопления (подушка → цели).
//   ladder        «порядок приоритетов»: стартовая подушка на 1 месяц →
//                 дорогие долги (ставка ≥ порога) → полная подушка →
//                 дешёвые долги → цели.
// Стратегии — порядок, в котором гасятся долги сверх минимумов:
//   avalanche  по ставке, самый дорогой первым — минимальная переплата;
//   snowball   по остатку, самый маленький первым — быстрые закрытия;
//   cash_flow  по «остаток / минимальный платёж» — быстрее всего
//              освобождает ежемесячные деньги (Cash Flow Index).
// Во всех стратегиях минимальный платёж закрытого долга не пропадает, а
// переходит в следующий по очереди (roll-over) — так эти методы и работают.

export type PriorityMode = 'debts_first' | 'cushion_first' | 'split' | 'ladder'
export type DebtStrategy = 'avalanche' | 'snowball' | 'cash_flow'

export interface PlanSettings {
  mode: PriorityMode
  strategy: DebtStrategy
  /** Размер подушки в месяцах обычных расходов (обычные траты + минимальные платежи). */
  cushionMonths: number
  /** split: какой процент свободных денег идёт в долги. */
  splitDebtPct: number
  /** ladder: долг с этой ставкой (% годовых) и выше считается дорогим. */
  highRateThreshold: number
  /** День (1-31), с которого начинается бюджетный месяц — обычно день зарплаты; null — календарный месяц. */
  periodStartDay: number | null
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  mode: 'debts_first',
  strategy: 'avalanche',
  cushionMonths: 3,
  splitDebtPct: 50,
  highRateThreshold: 15,
  periodStartDay: null,
}

export interface PlanDebt {
  id: string
  title: string
  balance: number
  /** % годовых; null — без процентов. */
  rate: number | null
  min: number
}

export interface PlanInput {
  debts: PlanDebt[]
  /** Деньги сверх обычных трат и минимальных платежей, в месяц. */
  monthlyExtra: number
  settings: PlanSettings
  cushionBalance: number
  /** Обычный месяц: обычные траты + минимальные платежи. В нём меряется подушка. */
  monthlyNeed: number
  start: Date
  /** false — минимальные платежи закрытых долгов пропадают (базовый сценарий «только минимумы»). */
  rollover?: boolean
}

export interface PlanMonth {
  month: number
  date: string
  debt: number
  cushion: number
}

export interface PlanResult {
  hasDebts: boolean
  /** Когда закроется последний долг; null — долгов нет или за 50 лет не закроются. */
  debtFreeDate: string | null
  debtFreeMonths: number | null
  totalInterest: number
  closures: Array<{ id: string; title: string; date: string; months: number }>
  cushionTarget: number
  /** Когда подушка наберётся; сегодняшняя дата, если уже набрана; null — не наберётся. */
  cushionFullDate: string | null
  /** С какого месяца деньги начнут идти на цели и сколько в тот месяц. */
  goalsStartDate: string | null
  goalsMonthly: number
  /** Раскладка этого месяца. */
  now: { toDebts: number; toCushion: number; toGoals: number }
  /** Помесячно, для графика (до 10 лет). */
  timeline: PlanMonth[]
}

const PLAN_MAX_MONTHS = 600 // 50 лет: дальше план не считается реальным

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonthsTo(start: Date, months: number) {
  const d = new Date(start.getFullYear(), start.getMonth() + months, 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(start.getDate(), lastDay))
  return d
}

/** Порядок погашения сверх минимумов для выбранной стратегии. */
export function orderDebts<T extends PlanDebt>(debts: T[], strategy: DebtStrategy): T[] {
  const rate = (d: T) => d.rate ?? 0
  const cfi = (d: T) => (d.min > 0 ? d.balance / d.min : Number.POSITIVE_INFINITY)
  return [...debts].sort((a, b) =>
    strategy === 'avalanche'
      ? rate(b) - rate(a) || a.balance - b.balance
      : strategy === 'snowball'
        ? a.balance - b.balance || rate(b) - rate(a)
        : cfi(a) - cfi(b) || rate(b) - rate(a),
  )
}

/** Помесячная симуляция плана. Детерминированная: одни и те же входы — одни и те же даты. */
export function simulatePlan(input: PlanInput): PlanResult {
  const { settings } = input
  const rollover = input.rollover ?? true
  const ordered = orderDebts(input.debts.filter((d) => d.balance > 0.5), settings.strategy)
  const balances = new Map(ordered.map((d) => [d.id, d.balance]))
  const closedAt = new Map<string, number>()
  const cushionTarget = Math.max(0, Math.round(settings.cushionMonths * input.monthlyNeed))
  const starterTarget = Math.min(cushionTarget, Math.max(0, Math.round(input.monthlyNeed)))
  const isHigh = (d: PlanDebt) => (d.rate ?? 0) >= settings.highRateThreshold

  let cushion = Math.max(0, input.cushionBalance)
  let totalInterest = 0
  let cushionFullMonth: number | null = cushion >= cushionTarget ? 0 : null
  let goalsStartMonth: number | null = null
  let goalsMonthly = 0
  let now = { toDebts: 0, toCushion: 0, toGoals: 0 }
  const timeline: PlanMonth[] = [
    { month: 0, date: isoDate(input.start), debt: Math.round([...balances.values()].reduce((s, b) => s + b, 0)), cushion: Math.round(cushion) },
  ]

  const open = () => ordered.filter((d) => (balances.get(d.id) ?? 0) > 0.5)

  let month = 0
  while (month < PLAN_MAX_MONTHS) {
    if (open().length === 0) {
      // Долгов нет: дальше меняется только подушка/цели — считать, пока есть
      // чем их пополнять и пока не ясно, когда начнутся цели.
      const futurePool = input.monthlyExtra + (rollover ? ordered.reduce((s, d) => s + d.min, 0) : 0)
      if (futurePool <= 0.5 || (cushionFullMonth != null && goalsStartMonth != null)) break
    }
    month += 1

    // 1. Проценты и минимальные платежи.
    let pool = input.monthlyExtra
    for (const d of ordered) {
      const bal = balances.get(d.id) ?? 0
      if (bal <= 0.5) {
        if (rollover && closedAt.has(d.id)) pool += d.min // платёж закрытого долга переходит дальше
        continue
      }
      const interest = (bal * (d.rate ?? 0)) / 100 / 12
      totalInterest += interest
      const pay = Math.min(d.min, bal + interest)
      balances.set(d.id, bal + interest - pay)
      if (rollover) pool += d.min - pay // недоиспользованный минимум — тоже свободные деньги
    }
    for (const d of ordered) if ((balances.get(d.id) ?? 0) <= 0.5 && !closedAt.has(d.id)) closedAt.set(d.id, month)

    // 2. Раскладка свободных денег по режиму.
    const spent = { toDebts: 0, toCushion: 0, toGoals: 0 }
    const payDebts = (amount: number, only?: (d: PlanDebt) => boolean) => {
      let left = amount
      for (const d of open()) {
        if (left <= 0) break
        if (only && !only(d)) continue
        const bal = balances.get(d.id) ?? 0
        const pay = Math.min(left, bal)
        balances.set(d.id, bal - pay)
        spent.toDebts += pay
        left -= pay
        if (bal - pay <= 0.5) closedAt.set(d.id, month)
      }
      return left
    }
    const fillCushion = (amount: number, cap: number) => {
      const add = Math.min(amount, Math.max(0, cap - cushion))
      cushion += add
      spent.toCushion += add
      return amount - add
    }

    let rest = Math.max(0, pool)
    if (settings.mode === 'debts_first') {
      rest = payDebts(rest)
      rest = fillCushion(rest, cushionTarget)
    } else if (settings.mode === 'cushion_first') {
      rest = fillCushion(rest, cushionTarget)
      rest = payDebts(rest)
    } else if (settings.mode === 'split') {
      const toDebt = (rest * settings.splitDebtPct) / 100
      let toSave = rest - toDebt
      toSave += payDebts(toDebt)
      rest = fillCushion(toSave, cushionTarget)
    } else {
      rest = fillCushion(rest, starterTarget)
      rest = payDebts(rest, isHigh)
      rest = fillCushion(rest, cushionTarget)
      rest = payDebts(rest)
    }
    spent.toGoals += rest

    if (month === 1) now = spent
    if (cushionFullMonth == null && cushion >= cushionTarget) cushionFullMonth = month
    if (goalsStartMonth == null && spent.toGoals > 0.5) {
      goalsStartMonth = month
      goalsMonthly = spent.toGoals
    }
    if (month <= 120) {
      timeline.push({
        month,
        date: isoDate(addMonthsTo(input.start, month)),
        debt: Math.round([...balances.values()].reduce((s, b) => s + Math.max(0, b), 0)),
        cushion: Math.round(cushion),
      })
    }
  }

  const hasDebts = ordered.length > 0
  const allClosed = hasDebts && open().length === 0
  const lastClose = allClosed ? Math.max(...[...closedAt.values()]) : null
  const dateAt = (m: number | null) => (m == null ? null : isoDate(addMonthsTo(input.start, m)))

  return {
    hasDebts,
    debtFreeDate: dateAt(lastClose),
    debtFreeMonths: lastClose,
    totalInterest: Math.round(totalInterest),
    closures: ordered
      .filter((d) => closedAt.has(d.id))
      .map((d) => ({ id: d.id, title: d.title, months: closedAt.get(d.id)!, date: dateAt(closedAt.get(d.id)!)! }))
      .sort((a, b) => a.months - b.months),
    cushionTarget,
    cushionFullDate: dateAt(cushionFullMonth),
    goalsStartDate: dateAt(goalsStartMonth),
    goalsMonthly: Math.round(goalsMonthly),
    now: { toDebts: Math.round(now.toDebts), toCushion: Math.round(now.toCushion), toGoals: Math.round(now.toGoals) },
    timeline,
  }
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

/**
 * Границы бюджетного месяца со сдвигом: back=0 — текущий, 1 — прошлый и т.д.
 * startDay — settings.periodStartDay (null — календарный). Конец включительно.
 * Та же арифметика, что внутри computeBudget; нужна выписке, чтобы суммировать прошлый месяц.
 */
export function budgetPeriod(today: Date, startDay: number | null, back = 0): { start: string; end: string; days: number } {
  const lastDayOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const startOf = (idx: number) => {
    const y = Math.floor(idx / 12)
    const m = idx % 12
    return Date.UTC(y, m, startDay == null ? 1 : Math.min(startDay, lastDayOf(y, m)))
  }
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const cur = startDay != null && d < Math.min(startDay, lastDayOf(y, m)) ? monthIndex(y, m) - 1 : monthIndex(y, m)
  const idx = cur - back
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return { start: iso(startOf(idx)), end: iso(startOf(idx + 1) - 86_400_000), days: Math.round((startOf(idx + 1) - startOf(idx)) / 86_400_000) }
}

/** Месяцев до срока крупной траты (1–12); срок в этом же месяце — 1: откладывать нужно сразу всё. */
export function annualMonthsLeft(dueMonth: number, today: Date): number {
  return Math.max(1, (((dueMonth - (today.getMonth() + 1)) % 12) + 12) % 12)
}

export function computeBudget(input: BudgetInput): Budget {
  const today = input.today ?? new Date()
  // Бюджетный месяц: календарный или от дня зарплаты (settings.periodStartDay).
  // Период k начинается в startOf(k) и длится до начала k+1; всё остальное —
  // траты, доходы, платежи — относится к периоду по дате через idxOf.
  const startDay = input.settings.periodStartDay ?? null
  const lastDayOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const startOf = (idx: number) => {
    const y = Math.floor(idx / 12)
    const m = idx % 12
    return { y, m, d: startDay == null ? 1 : Math.min(startDay, lastDayOf(y, m)) }
  }
  const idxOf = (y: number, m: number, d: number) =>
    startDay != null && d < Math.min(startDay, lastDayOf(y, m)) ? monthIndex(y, m) - 1 : monthIndex(y, m)
  const utc = (p: { y: number; m: number; d: number }) => Date.UTC(p.y, p.m, p.d)
  const dayIn = (p: { y: number; m: number; d: number }, idx: number) => Math.round((utc(p) - utc(startOf(idx))) / 86_400_000) + 1
  const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  const todayPos = { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() }
  const current = idxOf(todayPos.y, todayPos.m, todayPos.d)
  const dayOfMonth = dayIn(todayPos, current)
  const daysInMonth = Math.round((utc(startOf(current + 1)) - utc(startOf(current))) / 86_400_000)
  const daysLeft = daysInMonth - dayOfMonth + 1
  const periodStart = isoOf(utc(startOf(current)))
  const periodEnd = isoOf(utc(startOf(current + 1)) - 86_400_000)
  const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${input.currencySymbol}`

  // ── Доход ──────────────────────────────────────────────────────────────
  const settingsIncome = input.userIncomes.reduce<number>((s, v) => s + (v ?? 0), 0)
  const incomeIn = (idx: number) =>
    input.incomes.filter((i) => { const p = ymd(i.received_at); return idxOf(p.y, p.m, p.d) === idx }).reduce((s, i) => s + i.amount, 0)
  const thisMonthIncome = incomeIn(current)
  const lastMonthIncome = incomeIn(current - 1)
  const [income, incomeSource]: [number, Budget['incomeSource']] =
    settingsIncome > 0 ? [settingsIncome, 'settings']
    : thisMonthIncome > 0 ? [thisMonthIncome, 'this_month']
    : lastMonthIncome > 0 ? [lastMonthIncome, 'last_month']
    : [0, 'none']

  // ── История трат ───────────────────────────────────────────────────────
  const confirmed = input.expenses.filter((e) => e.is_confirmed)
  const withPos = confirmed.map((e) => {
    const p = ymd(e.spent_at)
    const idx = idxOf(p.y, p.m, p.d)
    return { e, idx, day: dayIn(p, idx), cat: e.category_id ?? UNCATEGORIZED }
  })
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
  // Платёж по долгу в месяц: минимум плюс взнос, который семья сама назначила (экран «Досрочка»).
  const dueOf = (d: (typeof activeDebts)[number]) => d.minimum_payment + (d.extra_monthly ?? 0)
  const minPayments = activeDebts.reduce((s, d) => s + dueOf(d), 0)
  // Резерв под крупные траты года: (сумма − отложено) / месяцев до срока. Срок в этом же месяце — откладывать нужно всё сразу.
  const annualReserve = (input.annualExpenses ?? []).reduce((s, a) => s + Math.max(0, a.amount - a.saved) / annualMonthsLeft(a.month, today), 0)
  const freeMonthly = income - minPayments - typicalSpend - annualReserve
  const monthlyNeed = typicalSpend + minPayments
  const cushionTarget = Math.round(input.settings.cushionMonths * monthlyNeed)
  // Откладывать некуда — нет ни долгов, ни целей, подушка набрана: тогда
  // свободное остаётся свободным и не резервируется.
  const nothingToFund = !activeDebts.length && !input.hasActiveGoals && input.cushionBalance >= cushionTarget
  const planExtra = nothingToFund ? 0 : Math.max(0, Math.floor(freeMonthly / 1000) * 1000)

  const plan = simulatePlan({
    debts: activeDebts.map((d) => ({ id: d.id, title: d.title, balance: d.current_balance, rate: d.interest_rate, min: dueOf(d) })),
    monthlyExtra: planExtra,
    settings: input.settings,
    cushionBalance: input.cushionBalance,
    monthlyNeed,
    start: today,
  })
  const { toDebts, toCushion, toGoals } = plan.now
  const planTarget: Budget['planTarget'] =
    toDebts + toCushion + toGoals <= 0 ? 'none' : toDebts >= toCushion && toDebts >= toGoals ? 'debts' : toCushion >= toGoals ? 'cushion' : 'goals'

  const paidThisMonth = new Map<string, number>()
  for (const p of input.debtPayments) {
    const pos = ymd(p.paid_at)
    if (idxOf(pos.y, pos.m, pos.d) === current) paidThisMonth.set(p.debt_id, (paidThisMonth.get(p.debt_id) ?? 0) + p.amount)
  }
  const debtPaid = [...paidThisMonth.values()].reduce((s, v) => s + v, 0)
  const unpaidMins = activeDebts.reduce((s, d) => s + Math.max(0, dueOf(d) - (paidThisMonth.get(d.id) ?? 0)), 0)
  const extraPaid = activeDebts.reduce((s, d) => s + Math.max(0, (paidThisMonth.get(d.id) ?? 0) - dueOf(d)), 0)
  const remainingDebt = activeDebts.reduce((s, d) => s + d.current_balance, 0)
  // Досрочные уже внесённые засчитываются в план по долгам; взносы в подушку
  // и цели не отслеживаются поштучно — их доля резервируется целиком.
  const reserved = Math.min(remainingDebt, unpaidMins + Math.max(0, toDebts - extraPaid)) + toCushion + toGoals

  const obligations = debtPaid + reserved + annualReserve
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
    const whereTo =
      planTarget === 'debts'
        ? ' — это деньги, которые ушли бы в долги'
        : planTarget === 'cushion'
          ? ' — это деньги, которые ушли бы в подушку'
          : planTarget === 'goals'
            ? ' — это деньги, которые ушли бы на цели'
            : ''

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
    settings: input.settings,
    plan,
    monthlyNeed,
    cushionBalance: input.cushionBalance,
    dayOfMonth,
    daysInMonth,
    daysLeft,
    periodStart,
    periodEnd,
    spent,
    debtPaid,
    reserved,
    annualReserve,
    obligations,
    limit,
    available,
    perDay,
    expectedByNow,
    categories,
    signals,
  }
}
