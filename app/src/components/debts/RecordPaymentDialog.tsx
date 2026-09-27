import { useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, SaveButton, formInputClass } from '@/components/chrome/FormSheet'
import { useAddDebtPayment, useDebts, useGoals, useMonth } from '@/hooks/use-finance-data'
import { orderDebts, simulatePlan, DEFAULT_PLAN_SETTINGS } from '@/lib/budget'
import { DebtClosedSheet, type ClosedDebtInfo } from '@/components/debts/DebtClosedSheet'
import { formatMoney } from '@/lib/format'
import type { Debt } from '@/types/domain'
import { ToggleVisual } from '@/components/chrome/Toggle'

export function RecordPaymentDialog({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt | null }) {
  const addPayment = useAddDebtPayment()
  const { data: debts } = useDebts()
  const { data: goals } = useGoals()
  const month = useMonth()
  const [amount, setAmount] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  // Survives this sheet closing (and `debt` going null) — the celebration opens right after.
  const [closedInfo, setClosedInfo] = useState<ClosedDebtInfo | null>(null)

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

    // Everything the "debt closed" screen needs is captured before the payment,
    // while the balance and the rest of the plan are still as they were.
    const closes = numericAmount >= debt.current_balance
    const info = closes ? closedDebtInfo(debt) : null

    await addPayment.mutateAsync({
      debt_id: debt.id,
      amount: numericAmount,
      paid_at: new Date().toISOString().slice(0, 10),
      is_extra: isExtra,
      note: null,
    })
    if (info) setClosedInfo(info)
    else toast.success('Платёж записан')
    reset()
    onOpenChange(false)
  }

  function closedDebtInfo(closing: Debt): ClosedDebtInfo {
    // «Сколько процентов сэкономили»: этот долг на одних минимальных платежах, без досрочных.
    const onMinimums = simulatePlan({
      debts: [{ id: closing.id, title: closing.title, balance: closing.current_balance, rate: closing.interest_rate, min: closing.minimum_payment }],
      monthlyExtra: 0,
      settings: DEFAULT_PLAN_SETTINGS,
      cushionBalance: 0,
      monthlyNeed: 0,
      start: new Date(),
      rollover: false,
    })
    // Следующий — по выбранной стратегии семьи, как в плане на экране «План».
    const nextDebt = orderDebts(
      (debts ?? [])
        .filter((d) => d.id !== closing.id && d.status === 'active' && d.current_balance > 0)
        .map((d) => ({ ...d, balance: d.current_balance, rate: d.interest_rate, min: d.minimum_payment })),
      month?.settings.strategy ?? 'avalanche',
    )[0]
    return {
      title: closing.title,
      currency: closing.currency,
      interestSaved: onMinimums.debtFreeDate ? onMinimums.totalInterest : null,
      freedMonthly: closing.minimum_payment,
      next: nextDebt
        ? { kind: 'debt', title: nextDebt.title }
        : (goals ?? []).some((g) => g.status === 'active')
          ? { kind: 'goals' }
          : { kind: 'free' },
    }
  }

  return (
    <>
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
        <ToggleVisual checked={isExtra} />
      </button>
    </FormSheet>
    <DebtClosedSheet info={closedInfo} onClose={() => setClosedInfo(null)} />
    </>
  )
}
