import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, formInputClass } from '@/components/chrome/FormSheet'
import { Paper, PaperRow } from '@/components/chrome/Paper'
import { ToggleVisual } from '@/components/chrome/Toggle'
import { useBudgetInput, useCreateReminder, useHouseholdSettings } from '@/hooks/use-finance-data'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrentUser } from '@/lib/auth'
import { newDebtImpact } from '@/lib/debt-check'
import { formatMoney, formatMonthYear } from '@/lib/format'
import { writeCheckFirst } from '@/lib/prefs'
import type { ProposedDebt } from '@/types/domain'

/**
 * «Перед новым долгом» (07): что берёшь, цена, срок, ставка — и сразу видно,
 * что изменится в плане, в свободных деньгах и в часах работы. Если цена выше
 * порога паузы из настроек, главное действие — «Напомнить через N ч»: решение
 * о покупке откладывается, а не принимается на эмоциях.
 */
export function NewDebtCheckSheet({
  open,
  onOpenChange,
  onProceed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Дальше — форма «Новый долг»; prefill — пустой, если «Сначала проверить» выключили. */
  onProceed: (prefill: ProposedDebt | null) => void
}) {
  const input = useBudgetInput()
  const user = useCurrentUser()
  const { data: settings } = useHouseholdSettings()
  const createReminder = useCreateReminder()

  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [term, setTerm] = useState('12')
  const [rate, setRate] = useState('0')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setPrice('')
    setTerm('12')
    setRate('0')
  }, [open])

  const debounced = useDebouncedValue({ title, price: Number(price), term: Number(term), rate: Number(rate) }, 100)
  const ready = debounced.price > 0 && debounced.term > 0
  const impact = useMemo(
    () =>
      input && ready
        ? newDebtImpact(input, { title: debounced.title, price: debounced.price, termMonths: debounced.term, ratePct: Math.max(0, debounced.rate || 0) }, user.monthly_income)
        : null,
    [input, ready, debounced, user.monthly_income],
  )

  const threshold = settings?.pause_threshold ?? null
  const pauseHours = settings?.pause_hours ?? 24
  const needsPause = threshold != null && Number(price) > threshold

  function prefill(): ProposedDebt {
    const p = Number(price)
    return {
      title: title.trim(),
      creditor: '',
      principal_amount: p > 0 ? p : null,
      current_balance: p > 0 ? p : null,
      interest_rate: Number(rate) > 0 ? Number(rate) : null,
      minimum_payment: impact ? Math.round(impact.monthlyPayment) : null,
      due_day: null,
    }
  }

  function skipCheck() {
    writeCheckFirst(false)
    onOpenChange(false)
    onProceed(null)
  }

  async function remind() {
    const fireAt = new Date(Date.now() + pauseHours * 3_600_000).toISOString()
    await createReminder.mutateAsync({
      fire_at: fireAt,
      kind: 'pause_purchase',
      payload: { title: title.trim(), price: Number(price), term_months: Number(term), rate: Number(rate) || 0 },
    })
    toast.success(`Напомню через ${pauseHours} ч — тогда и решишь`)
    onOpenChange(false)
  }

  function proceed() {
    onOpenChange(false)
    onProceed(prefill())
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Перед новым долгом"
      footer={
        <div className="flex flex-col gap-2">
          {needsPause ? (
            <>
              <button
                type="button"
                onClick={remind}
                disabled={createReminder.isPending}
                className="min-h-11 w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
              >
                Напомнить через {pauseHours} ч
              </button>
              <button type="button" onClick={proceed} className="min-h-11 w-full rounded-[13px] bg-hf-card py-3 text-[14px] text-hf-text-2">
                Всё равно беру
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={proceed}
              disabled={!ready}
              className="min-h-11 w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
            >
              Оформить долг
            </button>
          )}
        </div>
      }
    >
      <button
        type="button"
        role="switch"
        aria-checked
        onClick={skipCheck}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] bg-hf-card px-3.5 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-hf-text">Сначала проверить</span>
          <span className="block text-[11px] text-hf-text-4">Выключишь — сразу откроется форма долга</span>
        </span>
        <ToggleVisual checked />
      </button>

      <FormField label="Что берёшь">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ноутбук в рассрочку" className={formInputClass} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Цена, ₸">
          <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className={formInputClass} />
        </FormField>
        <FormField label="Срок, мес">
          <input type="number" inputMode="numeric" min={1} value={term} onChange={(e) => setTerm(e.target.value)} className={formInputClass} />
        </FormField>
      </div>
      <FormField label="Ставка, % годовых (0 — без процентов)">
        <input type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={formInputClass} />
      </FormField>

      <Paper className="flex flex-col gap-2.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">Что изменится</span>
        {!impact ? (
          <p className="text-[13px] text-hf-ink-soft">Укажи цену и срок — посчитаю.</p>
        ) : (
          <>
            <PaperRow label="Платёж" value={`${formatMoney(impact.monthlyPayment)} / мес`} />
            {impact.debtFree.after && (
              <div className="flex flex-col gap-0.5 text-[13px]">
                <div className="flex justify-between gap-2.5">
                  <span>Свобода от долгов</span>
                  <span className="font-mono text-hf-ink">{formatMonthYear(impact.debtFree.after)}</span>
                </div>
                {impact.debtFree.before && (
                  <div className="flex justify-between gap-2.5 text-[11px] text-hf-ink-soft">
                    <span>
                      было <span className="line-through">{formatMonthYear(impact.debtFree.before)}</span>
                    </span>
                    {impact.shiftMonths != null && impact.shiftMonths > 0 && <span className="font-mono text-hf-warn-ink">+{impact.shiftMonths} мес</span>}
                  </div>
                )}
              </div>
            )}
            <PaperRow
              label="Свободно в месяц"
              value={`${formatMoney(impact.freeMonthly.before)} → ${formatMoney(impact.freeMonthly.after)}`}
              tone={impact.freeMonthly.after < 0 ? 'warn' : 'default'}
            />
            {impact.workHours != null && <PaperRow label="В часах работы" value={`${impact.workHours} ч`} />}
            {impact.overpay > 0 && <PaperRow label="Переплата" value={formatMoney(impact.overpay)} tone="warn" />}
          </>
        )}
      </Paper>
      {needsPause && (
        <p className="text-[12px] leading-relaxed text-hf-text-3">
          Сумма выше порога паузы ({formatMoney(threshold!)}): сначала подожди {pauseHours} ч — я напомню.
        </p>
      )}
    </FormSheet>
  )
}
