import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormSheet, FormField, formInputClass, SaveButton } from '@/components/chrome/FormSheet'
import { useAddGoal, useUpdateGoal, useMonth } from '@/hooks/use-finance-data'
import { formatMoney, currencySymbol } from '@/lib/format'
import { monthLabel } from '@/lib/goal'
import type { Goal } from '@/types/domain'

interface FormState {
  title: string
  targetAmount: string
  currentAmount: string
  targetDate: string
}

const EMPTY_FORM: FormState = { title: '', targetAmount: '', currentAmount: '', targetDate: '' }
const CURRENCY = 'KZT'

/** Быстрые формулировки: чаще всего цель — это одна из четырёх вещей, и набирать её руками незачем. */
const PRESETS = ['Подушка на 3 месяца', 'Первый взнос', 'Отпуск', 'Закрыть кредитку']

/**
 * Создание и правка цели — нижний лист, как все остальные формы приложения
 * (раунд 3). Отличие от прошлой версии не в цвете: форма теперь отвечает.
 * Пока человек вводит сумму и срок, под полями считается «откладывать
 * N в месяц» и видно, влезает ли это в свободные деньги месяца — иначе
 * форма просит три цифры и молчит, а решение принимать не помогает.
 */
export function AddGoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (open: boolean) => void; goal?: Goal }) {
  const addGoal = useAddGoal()
  const updateGoal = useUpdateGoal()
  const month = useMonth()
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

  const preview = useMemo(() => {
    const target = Number(form.targetAmount) || 0
    const current = Number(form.currentAmount) || 0
    const left = Math.max(0, target - current)
    if (!left) return null

    if (form.targetDate) {
      const date = new Date(form.targetDate)
      if (Number.isNaN(date.getTime())) return null
      const now = new Date()
      const months = (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth())
      if (months <= 0) return { text: 'Дата уже прошла — выбери месяц в будущем', tone: 'warn' as const }
      const perMonth = Math.ceil(left / months)
      const fitsBudget = month?.hasIncome ? perMonth <= Math.max(0, month.available) : null
      return {
        text: `Откладывать ${formatMoney(perMonth, CURRENCY)} в месяц — ${months} мес`,
        hint:
          fitsBudget === null
            ? undefined
            : fitsBudget
              ? `Влезает: в этом месяце свободно ${formatMoney(month!.available, CURRENCY)}`
              : `Больше свободных денег месяца (${formatMoney(month!.available, CURRENCY)}) — сдвинь срок или сумму`,
        tone: fitsBudget === false ? ('warn' as const) : ('ok' as const),
      }
    }

    // Срока нет — считаем обратную задачу: от свободных денег месяца к дате.
    if (month?.hasIncome && month.available > 0) {
      const months = Math.ceil(left / month.available)
      const date = new Date()
      date.setMonth(date.getMonth() + months)
      return { text: `Если откладывать всё свободное — ${monthLabel(date)}`, tone: 'ok' as const }
    }
    return { text: 'Без срока цель просто копится — дату можно поставить позже', tone: 'ok' as const }
  }, [form.targetAmount, form.currentAmount, form.targetDate, month])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Укажи название цели')
      return
    }
    const target = Number(form.targetAmount)
    if (!target || target <= 0) {
      toast.error('Сумма цели должна быть больше нуля')
      return
    }
    const current = Number(form.currentAmount) || 0
    if (current > target) {
      toast.error('Накоплено больше цели — проверь суммы')
      return
    }

    const payload = {
      title: form.title.trim(),
      target_amount: target,
      current_amount: current,
      target_date: form.targetDate || null,
      currency: CURRENCY,
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
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Цель' : 'Новая цель'}
      footer={
        <form onSubmit={handleSubmit}>
          <SaveButton pending={isPending} pendingLabel="Сохраняю…">
            {isEdit ? 'Сохранить' : 'Поставить цель'}
          </SaveButton>
        </form>
      }
    >
      <FormField label="На что копим">
        <input
          className={formInputClass}
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Первый взнос на квартиру"
        />
      </FormField>

      {!isEdit && !form.title && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => update('title', p)}
              className="rounded-[10px] bg-hf-card px-3 py-2 text-[13px] text-hf-text-3"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label={`Сколько нужно, ${currencySymbol(CURRENCY)}`}>
          <input
            className={formInputClass + ' font-mono'}
            type="number"
            inputMode="decimal"
            value={form.targetAmount}
            onChange={(e) => update('targetAmount', e.target.value)}
            placeholder="0"
          />
        </FormField>
        <FormField label={`Уже есть, ${currencySymbol(CURRENCY)}`}>
          <input
            className={formInputClass + ' font-mono'}
            type="number"
            inputMode="decimal"
            value={form.currentAmount}
            onChange={(e) => update('currentAmount', e.target.value)}
            placeholder="0"
          />
        </FormField>
      </div>

      <FormField label="К какому числу — необязательно">
        <input className={formInputClass + ' font-mono'} type="date" value={form.targetDate} onChange={(e) => update('targetDate', e.target.value)} />
      </FormField>

      {preview && (
        <div className="space-y-1 rounded-[14px] bg-hf-card p-3.5">
          <p className={preview.tone === 'warn' ? 'text-[13px] text-hf-warn-on-dark' : 'text-[13px] text-hf-text-2'}>{preview.text}</p>
          {preview.hint && <p className="text-[11px] leading-snug text-hf-text-4">{preview.hint}</p>}
        </div>
      )}
    </FormSheet>
  )
}
