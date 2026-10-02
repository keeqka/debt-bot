// Математика банковского предложения. Файл живёт в двух местах — app/src/lib и
// supabase/functions/_shared (чат считает ГЭСВ на сервере): держать байт в байт
// одинаковыми, как budget.ts.

export interface OfferCashflow {
  /** Сумма, которую дают на руки до комиссий. */
  amount: number
  termMonths: number
  /** Платёж по кредиту в месяц, без страховки. */
  monthlyPayment: number
  /** Комиссии, которые платят сразу (за выдачу, оформление) — уменьшают сумму на руках. */
  upfrontFees?: number
  /** Ежемесячные доплаты (страховка, обслуживание) — часть платежа. */
  monthlyExtras?: number
}

/**
 * Месячная ставка, при которой дисконтированные платежи равны сумме на руках
 * (IRR по аннуитету). null — предложение не сходится (платежи меньше суммы).
 */
function monthlyIrr(cf: OfferCashflow): number | null {
  const net = cf.amount - (cf.upfrontFees ?? 0)
  const pay = cf.monthlyPayment + (cf.monthlyExtras ?? 0)
  const n = Math.round(cf.termMonths)
  if (!(net > 0) || !(pay > 0) || n <= 0) return null
  if (pay * n < net) return null
  const pv = (r: number) => (r === 0 ? pay * n : (pay * (1 - Math.pow(1 + r, -n))) / r)
  let lo = 0
  let hi = 1
  while (pv(hi) > net && hi < 1000) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (pv(mid) > net) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Эффективная ставка в % годовых с учётом комиссий и страховки — как ГЭСВ, но посчитанная по платежам. */
export function effectiveRatePct(cf: OfferCashflow): number | null {
  const r = monthlyIrr(cf)
  if (r == null) return null
  return Math.round((Math.pow(1 + r, 12) - 1) * 1000) / 10
}

/** Сколько всего переплатишь сверх суммы: платежи + страховка + комиссии − сумма. */
export function totalOverpay(cf: OfferCashflow): number {
  const n = Math.round(cf.termMonths)
  const paid = (cf.monthlyPayment + (cf.monthlyExtras ?? 0)) * n + (cf.upfrontFees ?? 0)
  return Math.max(0, Math.round(paid - cf.amount))
}
