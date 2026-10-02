import { useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, Segmented, SaveButton, formInputClass } from '@/components/chrome/FormSheet'
import { ConfirmSheet } from '@/components/chrome/ConfirmSheet'
import { ToggleVisual } from '@/components/chrome/Toggle'
import { useAddDebtPayment, useAddExpense, useAddIncome, useCategories, useDebts, useHouseholdSettings, useMonth } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import { orderDebts } from '@/lib/budget'
import { formatMoney } from '@/lib/format'
import { features } from '@/lib/env'

type TxType = 'expense' | 'income'

/**
 * Ручной ввод траты/дохода — резервный путь, спека §1: «вход — чек, не
 * форма». Поэтому это лист, а не отдельный экран, и открывается кнопкой
 * «Добавить вручную» на «Чеках», а не как равноценная альтернатива фото.
 */
export function AddTransactionDialog({
  open,
  onOpenChange,
  defaultType = 'expense',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultType?: TxType
}) {
  const userId = useCurrentUserId()
  const { data: categories } = useCategories()
  const addExpense = useAddExpense()
  const addIncome = useAddIncome()
  const addPayment = useAddDebtPayment()
  const { data: settings } = useHouseholdSettings()
  const { data: debts } = useDebts()
  const month = useMonth()

  const [type, setType] = useState<TxType>(defaultType)
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [note, setNote] = useState('')
  // Разовый доход (премия, подарок, возврат) — отличается от регулярной зарплаты; с ним связано правило «найденные деньги в долг».
  const [oneOff, setOneOff] = useState(false)
  const [windfall, setWindfall] = useState<{ share: number; debtId: string; debtTitle: string } | null>(null)

  const expenseCategories = categories?.filter((c) => c.type === 'expense') ?? []
  const isPending = addExpense.isPending || addIncome.isPending

  function reset() {
    setAmount('')
    setCategoryId('')
    setNote('')
    setOneOff(false)
  }

  async function handleSubmit() {
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      toast.error('Укажи сумму больше нуля')
      return
    }
    const today = new Date().toISOString().slice(0, 10)

    if (type === 'expense') {
      await addExpense.mutateAsync({
        user_id: userId,
        amount: numericAmount,
        currency: 'KZT',
        category_id: categoryId || null,
        merchant: null,
        spent_at: today,
        description: note || null,
        source: 'manual',
        receipt_asset_path: null,
        ai_confidence: null,
        is_confirmed: true,
      })
    } else {
      await addIncome.mutateAsync({
        user_id: userId,
        source: note || 'Доход',
        amount: numericAmount,
        currency: 'KZT',
        received_at: today,
        is_recurring: !oneOff,
        recurrence_day: null,
      })
      // Найденные деньги: часть разового дохода — в первый по стратегии долг (предлагаем, не списываем сами).
      const pct = settings?.windfall_to_debt_pct ?? 0
      const target = orderDebts(
        (debts ?? [])
          .filter((d) => d.status === 'active' && d.current_balance > 0)
          .map((d) => ({ ...d, balance: d.current_balance, rate: d.interest_rate, min: d.minimum_payment })),
        month?.settings.strategy ?? 'avalanche',
      )[0]
      if (features.settingsGroups && oneOff && pct > 0 && target) {
        const share = Math.min(Math.round((numericAmount * pct) / 100), target.current_balance)
        if (share > 0) setWindfall({ share, debtId: target.id, debtTitle: target.title })
      }
    }

    toast.success(type === 'expense' ? 'Расход добавлен' : 'Доход добавлен')
    reset()
    onOpenChange(false)
  }

  return (
    <>
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Запись вручную"
      footer={
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
          <SaveButton pending={isPending} pendingLabel="Сохраняю…">
            Сохранить
          </SaveButton>
        </form>
      }
    >
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Расход' },
          { value: 'income', label: 'Доход' },
        ]}
      />

      <FormField label="Сумма, ₸">
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus className={formInputClass} />
      </FormField>

      {type === 'expense' ? (
        <FormField label="Категория">
          <div className="flex flex-wrap gap-2">
            {expenseCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={
                  'rounded-[10px] px-3.5 py-2 text-[13px] ' +
                  (c.id === categoryId ? 'bg-hf-accent text-white' : 'bg-hf-card text-hf-text-4')
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        </FormField>
      ) : (
        <>
          <FormField label="Источник">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Зарплата, фриланс…" className={formInputClass} />
          </FormField>
          <button
            type="button"
            role="switch"
            aria-checked={oneOff}
            onClick={() => setOneOff((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] bg-hf-card px-3.5 py-2.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[13px] text-hf-text">Разовый доход</span>
              <span className="block text-[11px] text-hf-text-4">Премия, подарок, возврат — не регулярная зарплата</span>
            </span>
            <ToggleVisual checked={oneOff} />
          </button>
        </>
      )}

      {type === 'expense' && (
        <FormField label="Заметка (необязательно)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, аренда за сентябрь" className={formInputClass} />
        </FormField>
      )}
    </FormSheet>
    <ConfirmSheet
      open={windfall != null}
      onOpenChange={(o) => !o && setWindfall(null)}
      title="Часть найденных денег — в долг?"
      description={windfall ? `По твоему правилу ${settings?.windfall_to_debt_pct}% разового дохода идут в долг. Предлагаю внести ${formatMoney(windfall.share)} в «${windfall.debtTitle}».` : ''}
      confirmLabel={windfall ? `Внести ${formatMoney(windfall.share)}` : 'Внести'}
      destructive={false}
      pending={addPayment.isPending}
      onConfirm={async () => {
        if (!windfall) return
        await addPayment.mutateAsync({ debt_id: windfall.debtId, amount: windfall.share, paid_at: new Date().toISOString().slice(0, 10), is_extra: true, note: 'Найденные деньги' })
        toast.success('Досрочный платёж записан')
        setWindfall(null)
      }}
    />
    </>
  )
}
