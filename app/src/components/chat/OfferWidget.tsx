import { Paper, PaperRow } from '@/components/chrome/Paper'
import { Term } from '@/components/glossary/Term'
import { formatMoney } from '@/lib/format'
import type { OfferCompare, OfferParse } from '@/types/domain'

/**
 * Разбор банковского предложения на бумаге (08): условия строками, всё, что
 * хуже текущего долга самого пользователя, — тоном warn. Банки между собой не
 * сравниваются — только с тем, что у человека уже есть. Последняя строка —
 * его собственный долг для сравнения.
 */
export function OfferWidget({ offer, compare }: { offer: OfferParse; compare: OfferCompare | null }) {
  const base = compare?.rate ?? null
  const worse = (rate: number | null) => base != null && rate != null && rate > base
  const pct = (n: number) => `${n}%`

  const own = compare && (/кредитк|карт/i.test(compare.debt_title) ? 'Твоя кредитка сейчас' : `Сейчас: ${compare.debt_title}`)

  return (
    <Paper className="ml-9 flex w-fit max-w-[88%] flex-col gap-2 rounded-[16px] p-3.5">
      <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">{offer.product ?? 'Предложение банка'}</span>

      {offer.amount != null && (
        <PaperRow label="Сумма и срок" value={`${formatMoney(offer.amount)}${offer.term_months ? ` · ${offer.term_months} мес` : ''}`} />
      )}
      {offer.monthly_payment != null && <PaperRow label="Платёж" value={`${formatMoney(offer.monthly_payment)} / мес`} />}
      {offer.nominal_rate != null && <PaperRow label="Ставка" value={pct(offer.nominal_rate)} tone={worse(offer.nominal_rate) ? 'warn' : 'default'} />}
      {offer.effective_rate != null && (
        <PaperRow
          label={<>{<Term id="gesv">ГЭСВ</Term>}{offer.effective_rate_computed ? ' (расчётный)' : ''}</>}
          value={pct(offer.effective_rate)}
          tone={worse(offer.effective_rate) ? 'warn' : 'default'}
        />
      )}
      {offer.promo_period_months != null && <PaperRow label="Льготный период" value={`${offer.promo_period_months} мес`} />}
      {offer.rate_after_promo != null && (
        <PaperRow label="Ставка после льготного" value={pct(offer.rate_after_promo)} tone={worse(offer.rate_after_promo) ? 'warn' : 'default'} />
      )}
      {offer.fees.map((f, i) => (
        <PaperRow key={`${f.name}-${i}`} label={f.name} value={`${formatMoney(f.amount)}${f.kind === 'monthly' ? ' / мес' : ''}`} tone="warn" />
      ))}
      {offer.insurance_monthly != null && offer.insurance_monthly > 0 && (
        <PaperRow label="Страховка" value={`${formatMoney(offer.insurance_monthly)} / мес`} tone="warn" />
      )}
      {offer.total_overpay != null && <PaperRow label="Переплата" value={formatMoney(offer.total_overpay)} tone={offer.total_overpay > 0 ? 'warn' : 'default'} />}

      {compare && (
        <>
          <div className="h-px bg-hf-receipt-line" />
          <PaperRow label={own!} value={compare.rate != null ? `${compare.rate}%` : 'без ставки'} tone="accent" />
          <p className="-mt-1 text-[11px] text-hf-ink-soft">Остаток {formatMoney(compare.balance)}, минимум {formatMoney(compare.min_payment)} в месяц</p>
        </>
      )}
    </Paper>
  )
}
