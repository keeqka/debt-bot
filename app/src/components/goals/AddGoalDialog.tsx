import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAddGoal, useUpdateGoal } from '@/hooks/use-finance-data'
import type { Goal } from '@/types/domain'

interface FormState {
  title: string
  targetAmount: string
  currentAmount: string
  targetDate: string
}

const EMPTY_FORM: FormState = { title: '', targetAmount: '', currentAmount: '', targetDate: '' }

/** Create or edit a goal (ТЗ §5 экран 4). Pass `goal` to edit an existing one. */
export function AddGoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (open: boolean) => void; goal?: Goal }) {
  const addGoal = useAddGoal()
  const updateGoal = useUpdateGoal()
  const isEdit = Boolean(goal)
  const isPending = addGoal.isPending || updateGoal.isPending

  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (!open) return
    setForm(
      goal
        ? {
            title: goal.title,
            targetAmount: String(goal.target_amount),
            currentAmount: String(goal.current_amount),
            targetDate: goal.target_date ?? '',
          }
        : EMPTY_FORM,
    )
  }, [open, goal])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Укажите название цели')
      return
    }
    const target = Number(form.targetAmount)
    if (!target || target <= 0) {
      toast.error('Укажите сумму цели больше нуля')
      return
    }

    const payload = {
      title: form.title.trim(),
      target_amount: target,
      current_amount: Number(form.currentAmount) || 0,
      target_date: form.targetDate || null,
      currency: 'KZT',
      status: 'active' as const,
    }

    if (isEdit && goal) {
      await updateGoal.mutateAsync({ id: goal.id, patch: payload })
      toast.success('Цель обновлена')
    } else {
      await addGoal.mutateAsync(payload)
      toast.success('Цель добавлена')
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать цель' : 'Новая цель'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Название</Label>
            <Input id="goal-title" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Первый взнос на квартиру" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Сумма цели, ₸</Label>
              <Input id="goal-target" type="number" inputMode="decimal" value={form.targetAmount} onChange={(e) => update('targetAmount', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-current">Уже накоплено, ₸</Label>
              <Input id="goal-current" type="number" inputMode="decimal" value={form.currentAmount} onChange={(e) => update('currentAmount', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-date">Желаемая дата (необязательно)</Label>
            <Input id="goal-date" type="date" value={form.targetDate} onChange={(e) => update('targetDate', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Добавить цель'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
