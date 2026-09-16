import { useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, SaveButton, formInputClass } from '@/components/chrome/FormSheet'
import { useAddDebtPayment } from '@/hooks/use-finance-data'
import { formatMoney } from '@/lib/format'
import type { Debt } from '@/types/domain'
import { cn } from '@/lib/utils'

export function RecordPaymentDialog({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt | null }) {
  const addPayment = useAddDebtPayment()
  const [amount, setAmount] = useState('')
  const [isExtra, setIsExtra] = useState(false)

  function reset() {
    setAmount('')
    setIsExtra(false)
  }

  async function handleSubmit() {
    if (!debt) return
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      toast.error('Укажи сумму больше нуля')
      return
    }

    await addPayment.mutateAsync({
      debt_id: debt.id,
      amount: numericAmount,
      paid_at: new Date().toISOString().slice(0, 10),
      is_extra: isExtra,
      note: null,
    })
    toast.success('Платёж записан')
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
      title={debt ? `Платёж · ${debt.title}` : 'Платёж по долгу'}
      footer={
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
          <SaveButton pending={addPayment.isPending} pendingLabel="Сохраняю…">
            Записать платёж
          </SaveButton>
        </form>
      }
    >
      {debt && <p className="text-[13px] text-hf-text-3">Текущий остаток: {formatMoney(debt.current_balance, debt.currency)}</p>}
      <FormField label="Сумма платежа, ₸">
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus className={formInputClass} />
      </FormField>
      <button
        type="button"
        onClick={() => setIsExtra((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-hf-card px-3.5 py-3 text-left"
      >
        <span className="text-[13px] text-hf-text-2">Сверх минимального платежа (досрочное)</span>
        <span
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', isExtra ? 'bg-hf-accent' : 'bg-hf-track')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', isExtra ? 'translate-x-[22px]' : 'translate-x-0.5')} />
        </span>
      </button>
    </FormSheet>
  )
}
