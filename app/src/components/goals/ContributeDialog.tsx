import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateGoal } from '@/hooks/use-finance-data'
import { formatMoney } from '@/lib/format'
import type { Goal } from '@/types/domain'

/** Adds a contribution to a goal's saved amount. */
export function ContributeDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (open: boolean) => void; goal: Goal | null }) {
  const updateGoal = useUpdateGoal()
  const [amount, setAmount] = useState('')

  async function handleSubmit() {
    if (!goal) return
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      toast.error('Укажите сумму больше нуля')
      return
    }

    await updateGoal.mutateAsync({ id: goal.id, patch: { current_amount: goal.current_amount + numericAmount } })
    toast.success('Пополнение сохранено')
    setAmount('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAmount('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Пополнить{goal ? `: ${goal.title}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {goal && (
            <p className="text-muted-foreground text-xs">
              Накоплено: {formatMoney(goal.current_amount, goal.currency)} из {formatMoney(goal.target_amount, goal.currency)}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="contribute-amount">Сумма пополнения, ₸</Label>
            <Input id="contribute-amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={updateGoal.isPending} className="w-full">
            {updateGoal.isPending ? 'Сохранение...' : 'Пополнить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
