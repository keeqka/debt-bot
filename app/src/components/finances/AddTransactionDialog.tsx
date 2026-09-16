import { useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, Segmented, SaveButton, formInputClass } from '@/components/chrome/FormSheet'
import { useAddExpense, useAddIncome, useCategories } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'

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

  const [type, setType] = useState<TxType>(defaultType)
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [note, setNote] = useState('')

  const expenseCategories = categories?.filter((c) => c.type === 'expense') ?? []
  const isPending = addExpense.isPending || addIncome.isPending

  function reset() {
    setAmount('')
    setCategoryId('')
    setNote('')
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
        is_recurring: false,
        recurrence_day: null,
      })
    }

    toast.success(type === 'expense' ? 'Расход добавлен' : 'Доход добавлен')
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
        <FormField label="Источник">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Зарплата, фриланс…" className={formInputClass} />
        </FormField>
      )}

      {type === 'expense' && (
        <FormField label="Заметка (необязательно)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, аренда за сентябрь" className={formInputClass} />
        </FormField>
      )}
    </FormSheet>
  )
}
