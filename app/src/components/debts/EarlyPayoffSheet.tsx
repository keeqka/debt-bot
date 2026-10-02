import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, Segmented } from '@/components/chrome/FormSheet'
import { Paper, PaperRow } from '@/components/chrome/Paper'
import { useAddDebtPayment, useBudgetInput, useMonth, useUpdateDebt } from '@/hooks/use-finance-data'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { earlyPayoffImpact, type EarlyMode } from '@/lib/debt-sim'
import { formatMoney, formatMonthYear } from '@/lib/format'
import type { Debt } from '@/types/domain'

const STEP = 1_000

/**
 * «Внести досрочно» (05): сколько и как — и сразу видно, что изменится. Дата,
 * переплата и взнос в подушку считаются той же computeBudget, что и весь
 * экран, поэтому цифры здесь совпадают с «Обзором» и «Планом» до месяца.
 */
export function EarlyPayoffSheet({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt | null }) {
  const month = useMonth()
  const input = useBudgetInput()
  const addPayment = useAddDebtPayment()
  const updateDebt = useUpdateDebt()

  const [mode, setMode] = useState<EarlyMode>('once')
  const [amount, setAmount] = useState(0)

  // Каждое открытие — заново: разово с нуля, ежемесячно — от текущего взноса по долгу.
  useEffect(() => {
    if (!open) return
    setMode('once')
    setAmount(0)
  }, [open, debt?.id])

  function changeMode(next: EarlyMode) {
    setMode(next)
    setAmount(next === 'monthly' ? (debt?.extra_monthly ?? 0) : 0)
  }

  const available = Math.max(0, month?.available ?? 0)
  const roundedDown = (n: number) => Math.floor(n / STEP) * STEP
  const cap =
    mode === 'once'
      ? roundedDown(Math.min(available, debt?.current_balance ?? 0))
      : Math.max(roundedDown(available), roundedDown(debt?.extra_monthly ?? 0))
  const value = Math.min(amount, cap)

  const debounced = useDebouncedValue(value, 100)
  const impact = useMemo(() => (input && debt ? earlyPayoffImpact(input, debt.id, mode, debounced) : null), [input, debt, mode, debounced])

  const unchanged = mode === 'monthly' ? value === (debt?.extra_monthly ?? 0) : value === 0
  const moved = impact?.monthsSaved != null && impact.monthsSaved > 0
  const saving = addPayment.isPending || updateDebt.isPending

  async function apply() {
    if (!debt || unchanged) return
    if (mode === 'once') {
      await addPayment.mutateAsync({ debt_id: debt.id, amount: value, paid_at: new Date().toISOString().slice(0, 10), is_extra: true, note: null })
      toast.success('Досрочный платёж записан')
    } else {
      await updateDebt.mutateAsync({ id: debt.id, patch: { extra_monthly: value } })
      toast.success(value > 0 ? 'Ежемесячный взнос включён в план' : 'Ежемесячный взнос убран из плана')
    }
    onOpenChange(false)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={debt ? `Досрочно: ${debt.title}` : 'Досрочно'}
      footer={
        <button
          type="button"
          onClick={apply}
          disabled={!debt || unchanged || saving}
          className="w-full rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Сохраняю…' : 'Включить в план'}
        </button>
      }
    >
      <Segmented
        value={mode}
        onChange={changeMode}
        options={[
          { value: 'once', label: 'Разово' },
          { value: 'monthly', label: 'Каждый месяц' },
        ]}
      />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="text-[11px] text-hf-text-4">{mode === 'once' ? 'Сумма сейчас' : 'Взнос в месяц сверх минимума'}</span>
          <span className="font-mono text-[20px] font-medium text-hf-text">{formatMoney(value)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={cap}
          step={STEP}
          value={value}
          disabled={cap <= 0}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label="Сумма досрочного платежа"
          className="h-11 w-full cursor-pointer accent-hf-accent disabled:opacity-40"
        />
        <div className="flex justify-between font-mono text-[11px] text-hf-text-4">
          <span>0</span>
          <span>{cap > 0 ? `свободно ${formatMoney(cap)}` : 'свободных денег в этом месяце нет'}</span>
        </div>
      </div>

      <Paper className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="font-mono text-[11px] tracking-[0.1em] text-hf-ink-soft uppercase">Свобода от долгов</span>
          {moved && <span className="font-mono text-[11px] text-hf-accent-ink">−{impact!.monthsSaved} мес</span>}
        </div>
        {!impact ? (
          <div className="h-8 w-40 animate-pulse rounded bg-hf-receipt-line" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-[28px] font-bold tracking-[-0.03em]">
              {impact.after.debtFreeDate ? formatMonthYear(impact.after.debtFreeDate) : 'не закроются'}
            </span>
            {moved && impact.before.debtFreeDate && (
              <span className="font-mono text-[13px] text-hf-ink-soft line-through">{formatMonthYear(impact.before.debtFreeDate)}</span>
            )}
          </div>
        )}
        <div className="h-px bg-hf-receipt-line" />
        {impact && (
          <>
            <PaperRow label="Сэкономишь на процентах" value={formatMoney(impact.interestSaved)} tone={impact.interestSaved > 0 ? 'accent' : 'default'} />
            {impact.after.debtCloses && (
              <PaperRow
                label="Этот долг закроется"
                value={
                  impact.before.debtCloses && impact.before.debtCloses.slice(0, 7) !== impact.after.debtCloses.slice(0, 7)
                    ? `${formatMonthYear(impact.after.debtCloses)} (было ${formatMonthYear(impact.before.debtCloses)})`
                    : formatMonthYear(impact.after.debtCloses)
                }
              />
            )}
            <PaperRow label="Новый платёж" value={`${formatMoney(impact.newPayment)} / мес`} />
          </>
        )}
      </Paper>

      {impact?.cushion.short && (
        <p className="rounded-[12px] bg-hf-receipt-warn px-3.5 py-2.5 text-[13px] leading-snug text-hf-warn-ink">
          Взнос в подушку в этом месяце: {formatMoney(impact.cushion.before)} → {formatMoney(impact.cushion.after)}. Эти деньги уйдут в долг, а не в подушку.
        </p>
      )}
      {impact && !unchanged && !moved && !impact.cushion.short && (
        <p className="text-[12px] leading-relaxed text-hf-text-3">
          Общая дата свободы почти не сдвинется: её определяет самый долгий долг, а деньги сверх минимумов и так идут в долги. Выгода здесь — в процентах и в том, что этот долг закроется раньше.
        </p>
      )}
    </FormSheet>
  )
}
