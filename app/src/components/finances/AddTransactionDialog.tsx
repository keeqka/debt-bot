import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAddExpense, useAddIncome, useCategories } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'

type TxType = 'expense' | 'income'

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
      toast.error('Укажите сумму больше нуля')
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Новая запись</DialogTitle>
        </DialogHeader>

        <Tabs value={type} onValueChange={(v) => setType(v as TxType)}>
          <TabsList className="w-full">
            <TabsTrigger value="expense">Расход</TabsTrigger>
            <TabsTrigger value="income">Доход</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Сумма, ₸</Label>
            <Input id="amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>

          {type === 'expense' ? (
            <div className="space-y-1.5">
              <Label>Категория</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выбрать категорию">
                    {(value: string | null) => (value ? expenseCategories.find((c) => c.id === value)?.name : null) ?? 'Выбрать категорию'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="source">Источник</Label>
              <Input id="source" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Зарплата, фриланс..." />
            </div>
          )}

          {type === 'expense' && (
            <div className="space-y-1.5">
              <Label htmlFor="note">Заметка (необязательно)</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, аренда за сентябрь" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
