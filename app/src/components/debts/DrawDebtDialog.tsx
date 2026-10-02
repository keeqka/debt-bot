import { useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, SaveButton, formInputClass } from '@/components/chrome/FormSheet'
import { PaperRow, Paper } from '@/components/chrome/Paper'
import { useAddDebtDraw, useDebts, useMonth } from '@/hooks/use-finance-data'
import { cardAvailable, previewDraw } from '@/lib/credit-card'
import { replan } from '@/lib/month'
import { formatMoney, formatMonthYear } from '@/lib/format'
import type { Debt } from '@/types/domain'

/**
 * Снятие с кредитной карты: деньги забрали — остаток долга вырос. Перед записью
 * показываем, что изменится: остаток, доступный лимит, проценты и сдвиг даты
 * свободы от долгов (та же симуляция, что считает план). План, дата и статус
 * после записи пересчитываются сами.
 */
export function DrawDebtDialog({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt | null }) {
  const draw = useAddDebtDraw()
  const { data: debts } = useDebts()
  const month = useMonth()
  const [amount, setAmount] = useState('')

  const available = debt ? cardAvailable(debt) : null
  const preview = debt ? previewDraw(debt, Number(amount)) : null

  // Дата свободы до и после: тот же план, но остаток этой карты больше.
  let dateShift: { before: string | null; after: string | null } | null = null
  if (debt && month && debts && preview && preview.amount > 0 && !preview.overLimit) {
    const before = replan(month, debts).debtFreeDate
    const after = replan(
      month,
      debts.map((d) => (d.id === debt.id ? { ...d, current_balance: preview.newBalance, status: 'active' as const } : d)),
    ).debtFreeDate
    dateShift = { before, after }
  }

  function reset() {
    setAmount('')
  }

  async function handleSubmit() {
    if (!debt || !preview) return
    if (preview.amount <= 0) {
      toast.error('Укажи сумму больше нуля')
      return
    }
    if (preview.overLimit) {
      toast.error(`Больше доступного лимита: ${formatMoney(available ?? 0, debt.currency)}`)
      return
    }
    await draw.mutateAsync({ debt_id: debt.id, amount: preview.amount, drawn_at: new Date().toISOString().slice(0, 10), note: null })
    toast.success('Снятие записано — план пересчитан')
    reset()
    onOpenChange(false)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title={debt ? `Снять с карты · ${debt.title}` : 'Снять с карты'}
      footer={
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
          <SaveButton pending={draw.isPending} pendingLabel="Сохраняю…">
            Записать снятие
          </SaveButton>
        </form>
      }
    >
      {debt && (
        <p className="text-[13px] leading-snug text-hf-text-3">
          Сейчас долг {formatMoney(debt.current_balance, debt.currency)}
          {available != null ? `, доступно ${formatMoney(available, debt.currency)} из лимита ${formatMoney(debt.credit_limit ?? 0, debt.currency)}` : ', лимит не указан'}.
        </p>
      )}
      <FormField label="Сколько сняли, ₸">
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus className={formInputClass} />
      </FormField>

      {debt && preview && preview.amount > 0 && (
        <Paper className="space-y-2 rounded-[16px] p-3.5">
          <PaperRow label="Долг станет" value={formatMoney(preview.newBalance, debt.currency)} tone={preview.overLimit ? 'warn' : 'default'} />
          {preview.availableAfter != null && <PaperRow label="Доступно после" value={formatMoney(preview.availableAfter, debt.currency)} />}
          {preview.monthlyInterest > 0 && <PaperRow label="Проценты на эту сумму" value={`~${formatMoney(preview.monthlyInterest, debt.currency)} / мес`} tone="warn" />}
          {dateShift && (
            <PaperRow
              label="Свобода от долгов"
              value={dateShift.after ? formatMonthYear(dateShift.after) : 'не наступит'}
              tone={dateShift.before && dateShift.after && dateShift.after > dateShift.before ? 'warn' : 'default'}
            />
          )}
          {preview.overLimit && <p className="text-[12px] leading-snug text-hf-warn-ink">Это больше доступного лимита, банк такое не даст.</p>}
        </Paper>
      )}
      <p className="text-[11px] leading-snug text-hf-text-4">
        Снятые деньги не считаются доходом. Траты, на которые они ушли, записывай как обычно. Минимальный платёж по карте остаётся прежним, пока ты сам его не поправишь.
      </p>
    </FormSheet>
  )
}
