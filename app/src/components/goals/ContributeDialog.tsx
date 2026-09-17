import { useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, formInputClass, SaveButton } from '@/components/chrome/FormSheet'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { Paper } from '@/components/chrome/Paper'
import { useUpdateGoal, useMonth } from '@/hooks/use-finance-data'
import { formatMoney, currencySymbol } from '@/lib/format'
import { goalMath, monthLabel } from '@/lib/goal'
import type { Goal } from '@/types/domain'

/** Быстрые суммы: «сколько свободно в этом месяце» и то, что нужно по плану — два самых частых ответа. */
export function ContributeDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (open: boolean) => void; goal: Goal | null }) {
  const updateGoal = useUpdateGoal()
  const month = useMonth()
  const [amount, setAmount] = useState('')

  const math = goal ? goalMath(goal) : null
  const value = Number(amount) || 0
  const after = goal ? Math.min(goal.target_amount, goal.current_amount + value) : 0
  const pctAfter = goal && goal.target_amount ? (after / goal.target_amount) * 100 : 0

  const quick = goal
    ? ([
        math?.monthlyNeeded ? { label: 'по плану', value: math.monthlyNeeded } : null,
        month?.hasIncome && month.available > 0 ? { label: 'всё свободное', value: Math.round(month.available) } : null,
        math && math.left > 0 ? { label: 'до цели', value: math.left } : null,
      ].filter(Boolean) as { label: string; value: number }[])
    : []

  function close(next: boolean) {
    if (!next) setAmount('')
    onOpenChange(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!goal) return
    if (value <= 0) {
      toast.error('Сумма должна быть больше нуля')
      return
    }
    await updateGoal.mutateAsync({ id: goal.id, patch: { current_amount: goal.current_amount + value } })
    toast.success(after >= goal.target_amount ? 'Цель собрана' : 'Пополнение сохранено')
    setAmount('')
    onOpenChange(false)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={close}
      title={goal ? `Пополнить: ${goal.title}` : 'Пополнить'}
      footer={
        <form onSubmit={handleSubmit}>
          <SaveButton pending={updateGoal.isPending} pendingLabel="Сохраняю…">
            Пополнить
          </SaveButton>
        </form>
      }
    >
      {goal && (
        <Paper className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
            <span>Станет</span>
            <span className="font-mono text-hf-accent-ink">{formatMoney(after, goal.currency)}</span>
          </div>
          <ProgressBar pct={pctAfter} onPaper />
          <div className="flex justify-between gap-2.5 font-mono text-[11px] text-hf-ink-soft">
            <span>сейчас {formatMoney(goal.current_amount, goal.currency)}</span>
            <span>цель {formatMoney(goal.target_amount, goal.currency)}</span>
          </div>
        </Paper>
      )}

      <FormField label={`Сумма пополнения, ${currencySymbol(goal?.currency)}`}>
        <input
          className={formInputClass + ' font-mono'}
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          autoFocus
        />
      </FormField>

      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setAmount(String(q.value))}
              className="flex items-baseline gap-2 rounded-[10px] bg-hf-card px-3 py-2 text-[13px] text-hf-text-3"
            >
              {q.label}
              <span className="font-mono text-[11px] text-hf-text-4">{formatMoney(q.value, goal?.currency)}</span>
            </button>
          ))}
        </div>
      )}

      {goal && value > 0 && after < goal.target_amount && math?.monthlyNeeded ? (
        <p className="text-[11px] leading-snug text-hf-text-4">
          Такими взносами цель закроется к {monthLabel(forecast(goal, value))}.
        </p>
      ) : null}
    </FormSheet>
  )
}

function forecast(goal: Goal, perMonth: number) {
  const left = Math.max(0, goal.target_amount - goal.current_amount)
  const months = Math.max(1, Math.ceil(left / perMonth))
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date
}
