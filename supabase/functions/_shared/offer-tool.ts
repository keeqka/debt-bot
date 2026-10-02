// Разбор скриншота банковского предложения (кредит, карта, рассрочка) для чата.
// Извлекает поля инструментом record_offer; ГЭСВ, если банк его не указал,
// считается самим кодом по платежам (offer-math.ts), а не берётся «из головы» модели.

import { callClaudeTool, type ContentBlock } from './claude.ts'
import { effectiveRatePct, totalOverpay } from './offer-math.ts'

export const OFFER_TOOL = {
  name: 'record_offer',
  description: 'Structured terms of a bank loan / credit card / installment offer shown on a screenshot.',
  input_schema: {
    type: 'object',
    properties: {
      is_offer: { type: 'boolean', description: 'false if the image is not a bank loan, credit card or installment offer (e.g. a receipt, a chat, a statement)' },
      product: { type: ['string', 'null'], description: 'what is offered, short, in Russian: «Кредит наличными», «Кредитная карта», «Рассрочка на ноутбук»' },
      amount: { type: ['number', 'null'], description: 'loan amount / credit limit / purchase price' },
      term_months: { type: ['number', 'null'] },
      monthly_payment: { type: ['number', 'null'], description: 'monthly payment on the loan itself, without insurance' },
      nominal_rate: { type: ['number', 'null'], description: 'nominal annual rate, %' },
      effective_rate: { type: ['number', 'null'], description: 'ГЭСВ / ПСК / effective annual rate as PRINTED on the screenshot, %; null if not shown' },
      promo_period_months: { type: ['number', 'null'], description: 'months of the promo / grace rate; null if none' },
      rate_after_promo: { type: ['number', 'null'], description: 'annual rate after the promo period, %' },
      fees: {
        type: 'array',
        description: 'every fee shown: issuance, service, SMS, early repayment, etc.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            kind: { type: 'string', enum: ['upfront', 'monthly', 'other'], description: 'upfront — paid once at issuance; monthly — every month; other — conditional' },
          },
          required: ['name', 'amount', 'kind'],
        },
      },
      insurance_monthly: { type: ['number', 'null'], description: 'monthly insurance cost if shown' },
      total_overpay: { type: ['number', 'null'], description: 'total overpayment as PRINTED, if shown' },
    },
    required: ['is_offer'],
  },
}

export interface OfferFee {
  name: string
  amount: number
  kind: 'upfront' | 'monthly' | 'other'
}

export interface OfferParse {
  is_offer: boolean
  product: string | null
  amount: number | null
  term_months: number | null
  monthly_payment: number | null
  nominal_rate: number | null
  effective_rate: number | null
  /** true — банк ГЭСВ не указал, посчитано по платежам. */
  effective_rate_computed: boolean
  promo_period_months: number | null
  rate_after_promo: number | null
  fees: OfferFee[]
  insurance_monthly: number | null
  total_overpay: number | null
}

/** Долг пользователя, с которым сравнивается предложение: кредитка, а если её нет — самый дорогой долг. */
export interface OfferCompare {
  debt_title: string
  rate: number | null
  balance: number
  min_payment: number
}

export async function parseOfferImage(imageBase64: string, mediaType: string): Promise<OfferParse> {
  const block: ContentBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }
  const raw = await callClaudeTool<Omit<OfferParse, 'effective_rate_computed'>>({
    system:
      'Ты разбираешь скриншот банковского предложения по кредиту, кредитной карте или рассрочке. Если на картинке не предложение (чек, переписка, выписка, что-то постороннее) — is_offer=false. Иначе извлеки условия ровно как на экране: сумма, срок, платёж, ставка, ГЭСВ/ПСК (только если он написан), льготный период и ставка после него, все комиссии, страховка. Ничего не выдумывай и не считай сам — чего нет на картинке, то null.',
    messages: [{ role: 'user', content: [block, { type: 'text', text: 'Разбери это предложение.' }] }],
    tool: OFFER_TOOL,
    maxTokens: 1500,
  })

  const fees = Array.isArray(raw.fees) ? raw.fees.filter((f) => f && Number.isFinite(Number(f.amount))).map((f) => ({ ...f, amount: Number(f.amount) })) : []
  const offer: OfferParse = { ...raw, fees, effective_rate_computed: false }
  if (!offer.is_offer) return offer

  const upfront = fees.filter((f) => f.kind === 'upfront').reduce((s, f) => s + f.amount, 0)
  const monthlyFees = fees.filter((f) => f.kind === 'monthly').reduce((s, f) => s + f.amount, 0)
  const cashflow =
    offer.amount && offer.term_months && offer.monthly_payment
      ? { amount: offer.amount, termMonths: offer.term_months, monthlyPayment: offer.monthly_payment, upfrontFees: upfront, monthlyExtras: (offer.insurance_monthly ?? 0) + monthlyFees }
      : null

  if (offer.effective_rate == null && cashflow) {
    const computed = effectiveRatePct(cashflow)
    if (computed != null) {
      offer.effective_rate = computed
      offer.effective_rate_computed = true
    }
  }
  if (offer.total_overpay == null && cashflow) offer.total_overpay = totalOverpay(cashflow)
  return offer
}

/** С чем сравнивать: кредитка пользователя, иначе самый дорогой долг. Банки между собой не сравниваются. */
export function pickCompareDebt(debts: Array<{ title: string; rate: number | null; balance: number; min_payment: number }>): OfferCompare | null {
  if (!debts.length) return null
  const card = debts.find((d) => /кредитк|карт/i.test(d.title))
  const d = card ?? [...debts].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0]
  return { debt_title: d.title, rate: d.rate, balance: d.balance, min_payment: d.min_payment }
}
