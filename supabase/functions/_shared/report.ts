// «Выписка» — самодостаточная HTML-страница в виде длинного чека: как прошёл
// прошлый месяц, как идёт этот, что поправить, пока не поздно, долги и цели.
// Данные — тот же снимок, что у чата (finance-context.ts), цифры — из budget.ts.
// Рендер — чистая функция от ReportData: её же гоняют локально без базы.
// Никаких скриптов и внешних ресурсов — файл открывается где угодно, в том числе
// как документ в Telegram и в sandbox-iframe мини-аппа.

import { buildFinancialSnapshot } from './finance-context.ts'
import { budgetPeriod } from './budget.ts'

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

export interface ReportCategory {
  name: string
  amount: number
  /** Обычно за месяц; null — истории нет. */
  typical: number | null
}

export interface ReportData {
  generatedOn: string
  currency: string
  last: { label: string; income: number; incomeRecorded: boolean; spent: number; categories: ReportCategory[] } | null
  current: {
    label: string
    day: number
    days: number
    daysLeft: number
    income: number
    spent: number
    expectedByNow: number | null
    limit: number
    available: number
    perDay: number
    hasIncome: boolean
    categories: ReportCategory[]
  }
  fixes: string[]
  debts: Array<{ title: string; balance: number; rate: number | null; min: number; closes: string | null }>
  totalDebt: number
  debtFreeDate: string | null
  totalInterest: number
  goals: Array<{ title: string; current: number; target: number; date: string | null }>
  cushion: { balance: number; target: number }
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const monthNum = (iso: string) => Number(iso.slice(5, 7)) - 1
const dayNum = (iso: string) => Number(iso.slice(8, 10))
const monthYear = (iso: string) => `${MONTHS_NOM[monthNum(iso)]} ${iso.slice(0, 4)}`
const shortDay = (iso: string) => `${dayNum(iso)} ${MONTHS_SHORT[monthNum(iso)]}`
const fullDate = (iso: string) => `${dayNum(iso)} ${MONTHS[monthNum(iso)]} ${iso.slice(0, 4)}`

function periodLabel(startDay: number | null, start: string, end: string) {
  return startDay == null ? monthYear(start) : `${shortDay(start)} – ${shortDay(end)}`
}

function topCategories(
  rows: Array<{ amount: number; category_id: string | null }>,
  names: Record<string, string>,
  typical: Map<string, number | null>,
): ReportCategory[] {
  const sums = new Map<string, number>()
  for (const r of rows) {
    const id = r.category_id ?? 'uncategorized'
    sums.set(id, (sums.get(id) ?? 0) + r.amount)
  }
  return [...sums.entries()]
    .map(([id, amount]) => ({ name: names[id] ?? 'Без категории', amount, typical: typical.get(id) ?? null }))
    .sort((a, b) => b.amount - a.amount)
}

export async function collectReportData(supabase: SupabaseLike, householdId?: string): Promise<ReportData> {
  const snapshot = await buildFinancialSnapshot(supabase, householdId)
  const b = snapshot.budget
  const input = snapshot.budgetInput
  const today = input.today ?? new Date()
  const startDay = b.settings.periodStartDay
  const prev = budgetPeriod(today, startDay, 1)
  const inRange = (iso: string, r: { start: string; end: string }) => iso.slice(0, 10) >= r.start && iso.slice(0, 10) <= r.end
  const r0 = (n: number) => Math.round(n)

  // Прошлый период: суммы из тех же строк, что считают бюджет. Если в нём ни одной траты — истории нет.
  const prevExpenses = input.expenses.filter((e) => e.is_confirmed && inRange(e.spent_at, prev))
  const prevIncomeRecorded = input.incomes.filter((i) => inRange(i.received_at, prev)).reduce((s, i) => s + i.amount, 0)
  const last: ReportData['last'] = prevExpenses.length
    ? {
        label: periodLabel(startDay, prev.start, prev.end),
        income: r0(prevIncomeRecorded > 0 ? prevIncomeRecorded : b.income),
        incomeRecorded: prevIncomeRecorded > 0,
        spent: r0(prevExpenses.reduce((s, e) => s + e.amount, 0)),
        categories: topCategories(prevExpenses, input.categoryNames, new Map()).map((c) => ({ ...c, amount: r0(c.amount) })),
      }
    : null

  // Долги: срок платежа и внесённое в этом месяце — для «платёж через N дней».
  const scope = (q: SupabaseLike) => (householdId ? q.eq('household_id', householdId) : q)
  const [{ data: dueRows }, { data: paidRows }, { data: allGoals }] = await Promise.all([
    scope(supabase.from('debts').select('id, title, due_day, minimum_payment')).eq('status', 'active'),
    scope(supabase.from('debt_payments').select('debt_id, amount')).gte('paid_at', b.periodStart),
    scope(supabase.from('goals').select('title, target_amount, current_amount, target_date, is_cushion')).eq('status', 'active'),
  ])
  const paid = new Map<string, number>()
  for (const p of (paidRows ?? []) as Array<{ debt_id: string; amount: number }>) paid.set(p.debt_id, (paid.get(p.debt_id) ?? 0) + Number(p.amount))

  const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${input.currencySymbol}`

  const fixes: string[] = b.signals.slice(0, 4).map((s) => s.text)
  if (b.hasIncome && b.available < 0) fixes.push(`Бюджет месяца уже израсходован: перерасход ${money(-b.available)}.`)
  if (!b.hasIncome) fixes.push('Не указан доход — без него нет прогноза «сколько можно тратить в день». Укажи в настройках.')
  const spentTotal = b.categories.reduce((s, c) => s + c.amount, 0)
  const vague = b.categories.filter((c) => c.name === 'Прочее' || c.name === 'Без категории').reduce((s, c) => s + c.amount, 0)
  if (spentTotal > 0 && vague / spentTotal > 0.25) {
    fixes.push(`«Прочее» и траты без категории — ${Math.round((vague / spentTotal) * 100)}% месяца (${money(vague)}). Разнеси по категориям — приложение запомнит магазины.`)
  }
  const pending = input.expenses.filter((e) => !e.is_confirmed && inRange(e.spent_at, { start: b.periodStart, end: b.periodEnd })).length
  if (pending > 0) fixes.push(`Неподтверждённых трат: ${pending} — пока не подтверждены, в бюджет они не входят.`)
  for (const d of (dueRows ?? []) as Array<{ id: string; title: string; due_day: number | null; minimum_payment: number }>) {
    if (d.due_day == null) continue
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), d.due_day)
    const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const due = thisMonth >= day0 ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, d.due_day)
    const inDays = Math.round((due.getTime() - day0.getTime()) / 86_400_000)
    if (inDays <= 7 && (paid.get(d.id) ?? 0) < Number(d.minimum_payment)) {
      fixes.push(`Платёж по «${d.title}» ${inDays === 0 ? 'сегодня' : `через ${inDays} дн`} — минимум ${money(Number(d.minimum_payment))}, в этом месяце ещё не внесён.`)
    }
  }

  const closes = new Map(b.plan.closures.map((c) => [c.id, c.date]))
  const goalRows = (allGoals ?? []) as Array<{ title: string; target_amount: number; current_amount: number; target_date: string | null; is_cushion: boolean }>

  return {
    generatedOn: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    currency: input.currencySymbol,
    last,
    current: {
      label: periodLabel(startDay, b.periodStart, b.periodEnd),
      day: b.dayOfMonth,
      days: b.daysInMonth,
      daysLeft: b.daysLeft,
      income: r0(b.income),
      spent: r0(b.spent),
      expectedByNow: b.expectedByNow == null ? null : r0(b.expectedByNow),
      limit: r0(b.limit),
      available: r0(b.available),
      perDay: r0(b.perDay),
      hasIncome: b.hasIncome,
      categories: b.categories.map((c) => ({ name: c.name, amount: r0(c.amount), typical: c.typical == null ? null : r0(c.typical) })),
    },
    fixes,
    debts: snapshot.debts.map((d) => ({ title: d.title, balance: r0(d.balance), rate: d.rate, min: r0(d.min_payment), closes: closes.get(d.id) ?? null })),
    totalDebt: r0(snapshot.totalDebt),
    debtFreeDate: snapshot.debtFreeDate,
    totalInterest: r0(b.plan.totalInterest),
    goals: goalRows
      .filter((g) => !g.is_cushion)
      .map((g) => ({ title: g.title, current: r0(Number(g.current_amount)), target: r0(Number(g.target_amount)), date: g.target_date })),
    cushion: { balance: r0(b.cushionBalance), target: r0(b.plan.cushionTarget) },
  }
}

// ═══ Рендер ══════════════════════════════════════════════════════════════

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Лицо «Чека» — те же формы и цвета, что у маскота в приложении (Mascot.tsx), спокойное выражение. */
const FACE = `<svg class="face" viewBox="0 0 100 62" aria-hidden="true"><rect x="20" y="11" width="60" height="4" rx="1" fill="#BDB4A5"/><g fill="#191C21"><ellipse cx="28.5" cy="31" rx="7.5" ry="5.5"/><ellipse cx="71.5" cy="31" rx="7.5" ry="5.5"/><rect x="40" y="48" width="20" height="3.8" rx="1.6"/></g></svg>`

const CSS = `
*{box-sizing:border-box}
html{background:#17181c}
body{margin:0;padding:28px 12px 40px;font-family:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.45;color:#191C21;-webkit-text-size-adjust:100%}
.receipt{position:relative;max-width:400px;margin:12px auto;background:#F6F1E8;padding:26px 22px 30px}
.receipt:before,.receipt:after{content:"";position:absolute;left:0;right:0;height:8px;background-repeat:repeat-x;background-size:16px 8px}
.receipt:before{top:-7px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='8'><path d='M0 8 L8 0 L16 8 Z' fill='%23F6F1E8'/></svg>")}
.receipt:after{bottom:-7px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='8'><path d='M0 0 L8 8 L16 0 Z' fill='%23F6F1E8'/></svg>")}
.face{display:block;width:64px;margin:0 auto 6px}
h1{margin:0;text-align:center;font-size:17px;letter-spacing:.32em;font-weight:700}
.sub{text-align:center;color:#6b6558;font-size:11px;letter-spacing:.08em;margin-top:4px}
h2{margin:22px 0 8px;text-align:center;font-size:12px;letter-spacing:.2em;font-weight:700;border-top:1px dashed #BDB4A5;border-bottom:1px dashed #BDB4A5;padding:6px 0}
.sub2{text-align:center;color:#6b6558;font-size:11px;margin:-2px 0 8px}
.row{display:flex;align-items:baseline;gap:6px;margin:3px 0}
.row .l{min-width:0}
.row .dots{flex:1;border-bottom:1px dotted #BDB4A5;transform:translateY(-3px);min-width:12px}
.row .v{white-space:nowrap;text-align:right}
.row.big{font-size:15px;font-weight:700;margin:8px 0}
.warn{color:#c0632f}.ok{color:#2c6497}.mute{color:#6b6558}
.cat{margin:7px 0 2px}
.bar{height:4px;background:#DED6C8;margin-top:3px}
.bar i{display:block;height:100%;background:#3C82C8}
.bar i.over{background:#c0632f}
.note{font-size:11px;color:#6b6558;margin:1px 0 0}
.fix{margin:8px 0;padding-left:16px;position:relative}
.fix:before{content:"▸";position:absolute;left:0;color:#c0632f}
.fine{margin:8px 0;color:#2c6497}
.total{margin-top:20px;border-top:2px solid #191C21;padding-top:10px}
.barcode{height:34px;margin:18px auto 6px;max-width:220px;background:repeating-linear-gradient(90deg,#191C21 0 2px,transparent 2px 4px,#191C21 4px 5px,transparent 5px 9px,#191C21 9px 12px,transparent 12px 14px)}
.foot{text-align:center;color:#6b6558;font-size:11px}
`

export function renderReport(d: ReportData): string {
  const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${esc(d.currency)}`
  const row = (label: string, value: string, cls = '') =>
    `<div class="row ${cls}"><span class="l">${esc(label)}</span><span class="dots"></span><span class="v">${value}</span></div>`

  const cats = (list: ReportCategory[], limit: number, withTypical: boolean) => {
    const top = list.slice(0, limit)
    const max = Math.max(1, ...top.map((c) => c.amount))
    return top
      .map((c) => {
        const over = withTypical && c.typical != null && c.typical > 0 && c.amount > c.typical * 1.3
        return `<div class="cat">${row(c.name, money(c.amount), over ? 'warn' : '')}<div class="bar"><i class="${over ? 'over' : ''}" style="width:${Math.max(2, Math.round((c.amount / max) * 100))}%"></i></div>${
          withTypical && c.typical != null ? `<div class="note">обычно за месяц ${money(c.typical)}</div>` : ''
        }</div>`
      })
      .join('')
  }

  const out: string[] = []
  out.push(`<div class="receipt">${FACE}<h1>HLOW FLOW</h1><div class="sub">ВЫПИСКА · ${esc(fullDate(d.generatedOn))}</div>`)

  // Прошлый месяц
  out.push(`<h2>ПРОШЛЫЙ МЕСЯЦ</h2><div class="sub2">${esc(d.last?.label ?? '')}</div>`)
  if (d.last) {
    const left = d.last.income - d.last.spent
    out.push(row(d.last.incomeRecorded ? 'Доход' : 'Доход (по настройкам)', money(d.last.income)))
    out.push(row('Потрачено', money(d.last.spent)))
    out.push(row(left >= 0 ? 'Осталось' : 'Перерасход', money(Math.abs(left)), `big ${left >= 0 ? 'ok' : 'warn'}`))
    out.push(cats(d.last.categories, 5, false))
  } else {
    out.push('<div class="mute">Данных за прошлый месяц нет — история только начинает копиться.</div>')
  }

  // Этот месяц
  const c = d.current
  out.push(`<h2>ЭТОТ МЕСЯЦ</h2><div class="sub2">${esc(c.label)} · день ${c.day} из ${c.days}</div>`)
  out.push(row('Потрачено', money(c.spent)))
  if (c.expectedByNow != null) out.push(row('Обычно к этому дню', money(c.expectedByNow), 'mute'))
  if (c.hasIncome) {
    out.push(row('Бюджет на траты', money(c.limit)))
    out.push(row(c.available >= 0 ? 'Свободно' : 'Перерасход', money(Math.abs(c.available)), `big ${c.available >= 0 ? 'ok' : 'warn'}`))
    if (c.available > 0) out.push(row(`В день (ещё ${c.daysLeft} дн)`, money(c.perDay)))
  } else {
    out.push('<div class="mute">Доход не указан — показываю только факты.</div>')
  }
  out.push(cats(c.categories, 6, true))

  // Что поправить
  out.push('<h2>ПОПРАВИТЬ, ПОКА НЕ ПОЗДНО</h2>')
  out.push(d.fixes.length ? d.fixes.map((f) => `<div class="fix">${esc(f)}</div>`).join('') : '<div class="fine">Всё в порядке — поправлять нечего.</div>')

  // Долги
  out.push('<h2>ДОЛГИ</h2>')
  if (d.debts.length) {
    for (const x of d.debts) {
      out.push(`<div class="cat">${row(x.title, money(x.balance))}<div class="note">${x.rate != null ? `${x.rate}% · ` : ''}минимум ${money(x.min)}${x.closes ? ` · закроется ${esc(monthYear(x.closes))}` : ''}</div></div>`)
    }
    out.push(row('Всего долгов', money(d.totalDebt), 'big'))
    if (d.debtFreeDate) out.push(row('Свобода от долгов', esc(monthYear(d.debtFreeDate)), 'ok'))
    if (d.totalInterest > 0) out.push(row('Переплата по плану', money(d.totalInterest), 'mute'))
  } else {
    out.push('<div class="fine">Долгов нет.</div>')
  }

  // Цели и подушка
  out.push('<h2>ЦЕЛИ И ПОДУШКА</h2>')
  const bar = (cur: number, target: number) => `<div class="bar"><i style="width:${target > 0 ? Math.min(100, Math.max(2, Math.round((cur / target) * 100))) : 0}%"></i></div>`
  if (d.cushion.target > 0) out.push(`<div class="cat">${row('Подушка', `${money(d.cushion.balance)} / ${money(d.cushion.target)}`)}${bar(d.cushion.balance, d.cushion.target)}</div>`)
  for (const g of d.goals) {
    out.push(`<div class="cat">${row(g.title, `${money(g.current)} / ${money(g.target)}`)}${bar(g.current, g.target)}${g.date ? `<div class="note">к ${esc(fullDate(g.date))}</div>` : ''}</div>`)
  }
  if (!d.goals.length && d.cushion.target <= 0) out.push('<div class="mute">Целей пока нет.</div>')

  out.push(`<div class="total">${row('ИТОГО К РАЗБОРУ', String(d.fixes.length), `big ${d.fixes.length ? 'warn' : 'ok'}`)}</div>`)
  out.push('<div class="barcode"></div><div class="foot">Спасибо, что считаешь деньги<br>hlow flow</div></div>')

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>Hlow Flow — выписка</title><style>${CSS}</style></head><body>${out.join('')}</body></html>`
}

export async function buildReportHtml(supabase: SupabaseLike, householdId?: string): Promise<string> {
  return renderReport(await collectReportData(supabase, householdId))
}
