import { toast } from 'sonner'
import { Paper, PaperRow } from '@/components/chrome/Paper'
import { useCreateReminder } from '@/hooks/use-finance-data'
import { formatMoney, formatMonthYear } from '@/lib/format'
import type { DebtCheckCard as DebtCheckData, ProposedDebt } from '@/types/domain'

/**
 * «Что изменится» перед новым долгом, из чата (07): те же цифры и то же правило
 * паузы, что на экране «Долги» → «+ долг» → «Сначала проверить». Ничего не
 * создаётся, пока человек сам не нажмёт кнопку.
 */
export function DebtCheckCard({ card, onProceed }: { card: DebtCheckData; onProceed: (prefill: ProposedDebt) => void }) {
  const createReminder = useCreateReminder()
  const { impact, pause } = card

  function prefill(): ProposedDebt {
    return {
      title: card.title,
      creditor: '',
      principal_amount: card.price,
      current_balance: card.price,
      interest_rate: card.rate_pct > 0 ? card.rate_pct : null,
      minimum_payment: impact.monthlyPayment,
      due_day: null,
    }
  }

  async function remind() {
    await createReminder.mutateAsync({
      fire_at: new Date(Date.now() + pause.hours * 3_600_000).toISOString(),
      kind: 'pause_purchase',
      payload: { title: card.title, price: card.price, term_months: card.term_months, rate: card.rate_pct },
    })
    toast.success(`Напомню через ${pause.hours} ч — тогда и решишь`)
  }

  return (
    <div className="ml-9 w-fit max-w-[88%] space-y-2">
      <Paper className="flex flex-col gap-2 rounded-[16px] p-3.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">Что изменится · {card.title}</span>
        <PaperRow label="Платёж" value={`${formatMoney(impact.monthlyPayment)} / мес`} />
        {impact.debtFree.after && (
          <PaperRow
            label="Свобода от долгов"
            value={`${formatMonthYear(impact.debtFree.after)}${impact.shiftMonths ? ` (+${impact.shiftMonths} мес)` : ''}`}
            tone={impact.shiftMonths ? 'warn' : 'default'}
          />
        )}
        <PaperRow
          label="Свободно в месяц"
          value={`${formatMoney(impact.freeMonthly.before)} → ${formatMoney(impact.freeMonthly.after)}`}
          tone={impact.freeMonthly.after < 0 ? 'warn' : 'default'}
        />
        {impact.workHours != null && <PaperRow label="В часах работы" value={`${impact.workHours} ч`} />}
        {impact.overpay > 0 && <PaperRow label="Переплата" value={formatMoney(impact.overpay)} tone="warn" />}
      </Paper>

      <div className="flex gap-2">
        {pause.exceeds ? (
          <>
            <button
              type="button"
              onClick={remind}
              disabled={createReminder.isPending}
              className="min-h-11 flex-1 rounded-[10px] bg-hf-accent px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              Напомнить через {pause.hours} ч
            </button>
            <button type="button" onClick={() => onProceed(prefill())} className="min-h-11 flex-1 rounded-[10px] bg-hf-card px-3 text-xs text-hf-text-2">
              Всё равно беру
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onProceed(prefill())} className="min-h-11 flex-1 rounded-[10px] bg-hf-accent px-3 text-xs font-medium text-white">
            Оформить долг
          </button>
        )}
      </div>
    </div>
  )
}
