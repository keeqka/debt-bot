import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAddDebtPayment } from '@/hooks/use-finance-data'
import { formatMoney } from '@/lib/format'
import type { Debt } from '@/types/domain'

/** Records a payment against a debt (ТЗ §5 экран 2: "история платежей"). */
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
      toast.error('Укажите сумму больше нуля')
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Платёж по долгу{debt ? `: ${debt.title}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {debt && <p className="text-muted-foreground text-xs">Текущий остаток: {formatMoney(debt.current_balance, debt.currency)}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Сумма платежа, ₸</Label>
            <Input id="payment-amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isExtra} onChange={(e) => setIsExtra(e.target.checked)} className="h-4 w-4 rounded border-input" />
            Сверх минимального платежа (досрочное погашение)
          </label>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={addPayment.isPending} className="w-full">
            {addPayment.isPending ? 'Сохранение...' : 'Записать платёж'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
