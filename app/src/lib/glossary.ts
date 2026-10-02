import { computeBudget, orderDebts, type BudgetInput, type PlanDebt } from '@/lib/budget'
import { annuityPayment } from '@/lib/debt-check'
import { compareStrategies, simulate, type SimInput } from '@/lib/debt-sim'
import { effectiveRatePct, totalOverpay } from '@/lib/offer-math'
import type { ExplainLevel } from '@/types/domain'

/**
 * Словарь (09): термин на твоих цифрах. У каждого термина — короткое объяснение
 * (plain), подробности (detail) и example(ctx): пример из данных пользователя.
 * Нет подходящих данных — пример на условных цифрах, с пометкой sample.
 * Глубина (users.explain_level): simple — только plain; numbers — и пример;
 * detailed — ещё и detail.
 */

export type TermId = 'compound' | 'gesv' | 'minimum' | 'cushion' | 'avalanche' | 'snowball' | 'refinance' | 'installment'

export interface GlossaryCtx {
  /** null — данные ещё не загрузились. */
  input: BudgetInput | null
}

export interface ExampleRow {
  label: string
  value: string
  tone?: 'default' | 'accent' | 'warn'
}

export interface ExampleBar {
  label: string
  value: string
  /** 0–100, доля от самой длинной полосы. */
  pct: number
  tone?: 'accent' | 'warn'
}

export interface TermExample {
  title: string
  rows: ExampleRow[]
  bars?: ExampleBar[]
  note?: string
  /** true — цифры условные («пример»), не из данных пользователя. */
  sample: boolean
}

export interface GlossaryTerm {
  id: TermId
  title: string
  plain: string
  detail: string
  example: (ctx: GlossaryCtx) => TermExample
}

const sym = (ctx: GlossaryCtx) => ctx.input?.currencySymbol ?? '₸'
const money = (n: number, s: string) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ${s}`
const months = (n: number | null) => (n == null ? 'не закроется' : `${n} мес`)

interface DebtLite {
  title: string
  balance: number
  rate: number | null
  min: number
}

function activeDebts(ctx: GlossaryCtx): DebtLite[] {
  return (ctx.input?.debts ?? [])
    .filter((d) => d.status === 'active' && d.current_balance > 0)
    .map((d) => ({ title: d.title, balance: d.current_balance, rate: d.interest_rate, min: d.minimum_payment + (d.extra_monthly ?? 0) }))
}

const SAMPLE_DEBT: DebtLite = { title: 'Кредитка', balance: 300_000, rate: 36, min: 12_000 }

/** Один долг в одиночной симуляции: сколько месяцев и сколько процентов при данном платеже в месяц. */
function solo(d: DebtLite, monthlyPayment: number, rate = d.rate) {
  const input: SimInput = {
    debts: [{ id: 'x', title: d.title, balance: d.balance, rate, min: Math.max(1, monthlyPayment) }],
    monthlyExtra: 0,
    settings: { mode: 'debts_first', strategy: 'avalanche', cushionMonths: 3, splitDebtPct: 50, highRateThreshold: 15, periodStartDay: null },
    cushionBalance: 0,
    monthlyNeed: 0,
    start: new Date(),
  }
  const r = simulate(input, { rollover: false })
  return { months: r.perDebt[0].months, interest: r.totalInterest }
}

function bars(items: Array<{ label: string; interest: number; tone?: 'accent' | 'warn'; value: string }>): ExampleBar[] {
  const max = Math.max(1, ...items.map((i) => i.interest))
  return items.map((i) => ({ label: i.label, value: i.value, pct: Math.max(4, (i.interest / max) * 100), tone: i.tone }))
}

export const GLOSSARY: Record<TermId, GlossaryTerm> = {
  compound: {
    id: 'compound',
    title: 'Сложный процент',
    plain: 'Проценты начисляются не только на сам долг, но и на уже набежавшие проценты. Поэтому долг без платежей растёт всё быстрее.',
    detail: 'Каждый месяц банк берёт ставку/12 от остатка вместе с неоплаченными процентами. Чем дольше растягиваешь долг, тем больше переплата — а платёж сверх минимума срезает остаток, на который начисляются проценты.',
    example: (ctx) => {
      const s = sym(ctx)
      const real = activeDebts(ctx).filter((d) => (d.rate ?? 0) > 0).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0]
      const d = real ?? SAMPLE_DEBT
      const planExtra = ctx.input ? computeBudget(ctx.input).planExtra : 0
      const extra = real && planExtra > 0 ? planExtra : Math.round(d.min * 0.5)
      // Платёж по плану не выше самого остатка: больше долга всё равно не заплатишь.
      const planPay = Math.min(d.balance, d.min + extra)
      const minOnly = solo(d, d.min)
      const plan = solo(d, planPay)
      return {
        title: real ? `Твой самый дорогой долг: «${d.title}», ${d.rate}%` : `Пример: ${money(d.balance, s)} под ${d.rate}%`,
        rows: [
          { label: `Минимум ${money(d.min, s)}`, value: `${months(minOnly.months)} · ${money(minOnly.interest, s)}`, tone: 'warn' },
          { label: `По плану ${money(planPay, s)}`, value: `${months(plan.months)} · ${money(plan.interest, s)}`, tone: 'accent' },
        ],
        note: 'В строках: срок и переплата по процентам.',
        bars: bars([
          { label: 'Минималка', interest: minOnly.interest, tone: 'warn', value: money(minOnly.interest, s) },
          { label: 'По плану', interest: plan.interest, tone: 'accent', value: money(plan.interest, s) },
        ]),
        sample: !real,
      }
    },
  },

  gesv: {
    id: 'gesv',
    title: 'ГЭСВ',
    plain: 'Годовая эффективная ставка: сколько кредит стоит на самом деле за год — с комиссиями и страховкой, а не только по ставке из рекламы.',
    detail: 'ГЭСВ — ставка, при которой все твои платежи (кредит, страховка, комиссии) дисконтированно равны сумме, которую ты реально получил на руки. Сравнивать предложения нужно по ГЭСВ, а не по номинальной ставке.',
    example: (ctx) => {
      const s = sym(ctx)
      const real = activeDebts(ctx).sort((a, b) => b.balance - a.balance)[0]
      const principal = real?.balance ?? 300_000
      const nominal = 24
      const term = 12
      const payment = annuityPayment(principal, term, nominal)
      const cf = { amount: principal, termMonths: term, monthlyPayment: payment, upfrontFees: principal * 0.02, monthlyExtras: principal * 0.004 }
      const gesv = effectiveRatePct(cf)
      return {
        title: `Если взять ${money(principal, s)} на ${term} мес под ${nominal}%, комиссия 2% и страховка 0,4% в месяц`,
        rows: [
          { label: 'Ставка в рекламе', value: `${nominal}%` },
          { label: 'ГЭСВ (с комиссией и страховкой)', value: gesv != null ? `${gesv}%` : '—', tone: 'warn' },
          { label: 'Переплата', value: money(totalOverpay(cf), s), tone: 'warn' },
        ],
        note: 'Условия подобраны для примера — реальные смотри в договоре.',
        sample: !real,
      }
    },
  },

  minimum: {
    id: 'minimum',
    title: 'Минимальный платёж',
    plain: 'Меньше этой суммы платить нельзя: иначе просрочка. Но он рассчитан так, чтобы долг тянулся долго — банк зарабатывает на процентах.',
    detail: 'Минимальный платёж — обычно проценты плюс небольшая часть тела долга. Если платить только его, остаток падает медленно, и переплата за срок может превысить сам долг.',
    example: (ctx) => {
      const s = sym(ctx)
      const real = activeDebts(ctx).filter((d) => d.min > 0).sort((a, b) => b.balance - a.balance)[0]
      const d = real ?? SAMPLE_DEBT
      const base = solo(d, d.min)
      const more = solo(d, Math.round(d.min * 1.5))
      return {
        title: real ? `«${d.title}»: остаток ${money(d.balance, s)}` : `Пример: ${money(d.balance, s)} под ${d.rate}%`,
        rows: [
          { label: `Платишь минимум ${money(d.min, s)}`, value: `${months(base.months)} · ${money(base.interest, s)}`, tone: 'warn' },
          { label: `Платёж на половину больше (${money(d.min * 1.5, s)})`, value: `${months(more.months)} · ${money(more.interest, s)}`, tone: 'accent' },
        ],
        bars: bars([
          { label: 'Минимум', interest: base.interest, tone: 'warn', value: money(base.interest, s) },
          { label: '+50%', interest: more.interest, tone: 'accent', value: money(more.interest, s) },
        ]),
        sample: !real,
      }
    },
  },

  cushion: {
    id: 'cushion',
    title: 'Подушка',
    plain: 'Деньги на случай, если доход пропадёт или случится непредвиденное. Меряется в месяцах: на сколько хватит обычной жизни.',
    detail: 'Размер подушки — это N месяцев обычных расходов плюс платежи по долгам. Она защищает от новых долгов при потере дохода, но пока копишь, долги закрываются чуть позже.',
    example: (ctx) => {
      const s = sym(ctx)
      if (!ctx.input) return { title: 'Подушка', rows: [], sample: true }
      const b = computeBudget(ctx.input)
      if (b.monthlyNeed <= 0 && b.cushionBalance <= 0) {
        return {
          title: 'Пример: расходы 400 000 в месяц, на подушке 800 000',
          rows: [
            { label: 'Обычный месяц', value: money(400_000, s) },
            { label: 'Хватит на', value: '2 мес', tone: 'accent' },
          ],
          sample: true,
        }
      }
      const cover = b.monthlyNeed > 0 ? Math.round((b.cushionBalance / b.monthlyNeed) * 10) / 10 : 0
      return {
        title: 'Твоя подушка',
        rows: [
          { label: 'Обычный месяц (траты и платежи)', value: money(b.monthlyNeed, s) },
          { label: 'На подушке', value: money(b.cushionBalance, s) },
          { label: 'Хватит на', value: `${String(cover).replace('.', ',')} мес`, tone: cover >= b.settings.cushionMonths ? 'accent' : 'warn' },
          { label: 'Цель', value: `${b.settings.cushionMonths} мес = ${money(b.plan.cushionTarget, s)}` },
        ],
        sample: false,
      }
    },
  },

  avalanche: strategyTerm('avalanche', 'Лавина', 'Сначала гасишь долг с самой высокой ставкой — так переплата минимальна.', 'Все свободные деньги идут в самый дорогой по ставке долг, остальные — по минимуму. Закрыв его, переходишь к следующему, а освободившийся платёж добавляется. Математически это самый выгодный порядок.'),
  snowball: strategyTerm('snowball', 'Снежный ком', 'Сначала гасишь самый маленький долг: быстрее закрываются долги, а вместе с ними растёт мотивация.', 'Свободные деньги идут в долг с наименьшим остатком. Закрытые долги появляются раньше, платежи освобождаются быстрее, но переплата обычно чуть больше, чем у лавины.'),

  refinance: {
    id: 'refinance',
    title: 'Рефинансирование',
    plain: 'Новый кредит под меньшую ставку, чтобы закрыть старый. Выгодно, только если ставка заметно ниже с учётом комиссий.',
    detail: 'Банк даёт деньги на погашение старого долга по новой ставке. Выигрыш = разница в процентах за оставшийся срок минус комиссии и страховка нового кредита. Всегда сравнивай по ГЭСВ.',
    example: (ctx) => {
      const s = sym(ctx)
      const real = activeDebts(ctx).filter((d) => (d.rate ?? 0) > 5).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0]
      const d = real ?? SAMPLE_DEBT
      const newRate = Math.max(0, (d.rate ?? 0) - 5)
      const now = solo(d, d.min)
      const after = solo(d, d.min, newRate)
      return {
        title: real ? `«${d.title}»: ставка ${d.rate}% → ${newRate}%` : `Пример: ${money(d.balance, s)}, ставка ${d.rate}% → ${newRate}%`,
        rows: [
          { label: 'Переплата сейчас', value: money(now.interest, s), tone: 'warn' },
          { label: 'После рефинансирования', value: money(after.interest, s), tone: 'accent' },
          { label: 'Экономия до комиссий', value: money(Math.max(0, now.interest - after.interest), s), tone: 'accent' },
        ],
        note: 'Вычти комиссию и страховку нового кредита — экономия должна остаться.',
        sample: !real,
      }
    },
  },

  installment: {
    id: 'installment',
    title: 'Рассрочка',
    plain: 'Покупка с платежом частями. Без процентов — просто делишь цену на месяцы; но иногда проценты спрятаны в цене или в комиссии магазина.',
    detail: 'Честная рассрочка на N месяцев стоит ровно цену товара. Если цена в рассрочку выше, чем при оплате сразу, разница — скрытые проценты. Рассрочка всё равно уменьшает свободные деньги в месяц и сдвигает дату свободы от долгов.',
    example: (ctx) => {
      const s = sym(ctx)
      const income = ctx.input ? computeBudget(ctx.input).income : 0
      const price = income > 0 ? Math.max(1_000, Math.round((income * 0.5) / 1000) * 1000) : 360_000
      const term = 12
      const plain = annuityPayment(price, term, 0)
      const credit = annuityPayment(price, term, 18)
      return {
        title: `${money(price, s)} на ${term} мес`,
        rows: [
          { label: 'Рассрочка без процентов', value: `${money(plain, s)} / мес`, tone: 'accent' },
          { label: 'Кредит под 18%', value: `${money(credit, s)} / мес`, tone: 'warn' },
          { label: 'Разница за год', value: money((credit - plain) * term, s), tone: 'warn' },
        ],
        sample: income <= 0,
      }
    },
  },
}

function strategyTerm(id: 'avalanche' | 'snowball', title: string, plain: string, detail: string): GlossaryTerm {
  return {
    id,
    title,
    plain,
    detail,
    example: (ctx) => {
      const s = sym(ctx)
      const real = activeDebts(ctx)
      const list: DebtLite[] = real.length >= 2 ? real : [SAMPLE_DEBT, { title: 'Рассрочка', balance: 80_000, rate: 0, min: 8_000 }]
      const planDebts: PlanDebt[] = list.map((d, i) => ({ id: String(i), title: d.title, balance: d.balance, rate: d.rate, min: d.min }))
      const order = orderDebts(planDebts, id)
      const extra = ctx.input && real.length >= 2 ? computeBudget(ctx.input).planExtra : 20_000
      const [res] = compareStrategies(
        {
          debts: planDebts,
          monthlyExtra: extra,
          settings: ctx.input?.settings ?? { mode: 'debts_first', strategy: 'avalanche', cushionMonths: 3, splitDebtPct: 50, highRateThreshold: 15, periodStartDay: null },
          cushionBalance: 0,
          monthlyNeed: 0,
          start: new Date(),
        },
        [id],
      )
      return {
        title: real.length >= 2 ? 'Порядок гашения твоих долгов' : 'Пример: два долга',
        rows: [
          ...order.slice(0, 3).map((d, i) => ({ label: `${i + 1}. ${d.title}`, value: `${money(d.balance, s)}${d.rate ? ` · ${d.rate}%` : ''}`, tone: (i === 0 ? 'accent' : 'default') as 'accent' | 'default' })),
          { label: 'Первый долг закроется', value: months(res.firstClosedMonths) },
          { label: 'Переплата по процентам', value: money(res.totalInterest, s) },
        ],
        sample: real.length < 2,
      }
    },
  }
}

/** Что показывать при выбранной глубине: простое — только объяснение; цифры — и пример; подробно — ещё и формулы. */
export function explainParts(level: ExplainLevel) {
  return { example: level !== 'simple', detail: level === 'detailed' }
}

/** Термин по запросу «Что такое ГЭСВ?» и подобным — для быстрых ответов чата. */
export function findTermInText(text: string): TermId | null {
  const t = text.toLowerCase()
  if (/гэсв|пск/.test(t)) return 'gesv'
  if (/сложн[а-яё]* процент/.test(t)) return 'compound'
  if (/минимальн[а-яё]* платёж|минималк/.test(t)) return 'minimum'
  if (/подушк/.test(t)) return 'cushion'
  if (/лавин/.test(t)) return 'avalanche'
  if (/снежн[а-яё]* ком/.test(t)) return 'snowball'
  if (/рефинанс/.test(t)) return 'refinance'
  if (/рассрочк/.test(t)) return 'installment'
  return null
}
