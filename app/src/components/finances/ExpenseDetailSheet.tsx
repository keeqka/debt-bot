import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Check, Camera, FileStack, Pencil, Receipt as ReceiptIcon } from 'lucide-react'
import { FormSheet } from '@/components/chrome/FormSheet'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { ConfirmSheet } from '@/components/chrome/ConfirmSheet'
import { useCategories, useDeleteExpense, useUpdateExpense, useMonth } from '@/hooks/use-finance-data'
import { formatMoney, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Expense, ExpenseSource } from '@/types/domain'

const SOURCE_META: Record<ExpenseSource, { label: string; Icon: typeof Camera }> = {
  receipt_photo: { label: 'фото чека', Icon: Camera },
  screenshot: { label: 'скриншот', Icon: ReceiptIcon },
  statement: { label: 'выписка', Icon: FileStack },
  manual: { label: 'вручную', Icon: Pencil },
}

/**
 * Карточка траты: всё, что о ней известно, в одном листе.
 *
 * Зачем: до этого трата была строкой в списке «Последнее» с суммой и датой, и
 * единственное действие над ней — корзина. Откуда она взялась, в какую
 * категорию попала, насколько Чек уверен в распознанном и что она сделала
 * с месяцем — не видно нигде, хотя именно из этих вопросов состоит недоверие
 * к автоматическому разбору.
 *
 * Правило бумаги соблюдено: на светлой карточке — то, что пришло из чека
 * (магазин, сумма, дата, описание). Категория, уверенность и влияние
 * на месяц — интерфейс и слова Чека, поэтому тёмные.
 */
export function ExpenseDetailSheet({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: categories } = useCategories()
  const month = useMonth()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!expense) return null

  const expenseCategories = (categories ?? []).filter((c) => c.type === 'expense')
  const category = expenseCategories.find((c) => c.id === expense.category_id)
  const source = SOURCE_META[expense.source]
  const monthCategory = month?.categories.find((c) => c.id === expense.category_id)
  const shareOfCategory = monthCategory && monthCategory.amount > 0 ? expense.amount / monthCategory.amount : null
  const lowConfidence = expense.ai_confidence != null && expense.ai_confidence < 0.8

  async function setCategory(categoryId: string) {
    if (!expense || categoryId === expense.category_id) return
    await updateExpense.mutateAsync({ id: expense.id, patch: { category_id: categoryId } })
    toast.success('Категория обновлена')
  }

  async function confirm() {
    if (!expense) return
    await updateExpense.mutateAsync({ id: expense.id, patch: { is_confirmed: true } })
    toast.success('Записал как проверенное')
  }

  async function remove() {
    if (!expense) return
    await deleteExpense.mutateAsync(expense.id)
    toast.success('Трата удалена')
    setConfirmDelete(false)
    onOpenChange(false)
  }

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={expense.merchant ?? category?.name ?? 'Трата'}
        footer={
          expense.is_confirmed ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-hf-card py-3.5 text-[15px] text-hf-text-2"
            >
              <Trash2 className="h-4 w-4" />
              Удалить трату
            </button>
          ) : (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={confirm}
                disabled={updateExpense.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Всё верно
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Удалить трату"
                className="flex items-center justify-center rounded-[13px] bg-hf-card px-4 py-3.5 text-hf-text-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )
        }
      >
        <Paper className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2.5">
            <Eyebrow>{formatDateTime(expense.spent_at)}</Eyebrow>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-hf-ink-soft">
              <source.Icon className="h-3 w-3" />
              {source.label}
            </span>
          </div>

          <div className="text-[30px] leading-none font-bold tracking-[-0.03em]">{formatMoney(expense.amount, expense.currency)}</div>

          {expense.merchant && (
            <div className="flex justify-between gap-2.5 text-[13px]">
              <span>Магазин</span>
              <span className="min-w-0 truncate font-mono">{expense.merchant}</span>
            </div>
          )}
          {expense.description && (
            <>
              <div className="h-px bg-hf-receipt-line" />
              <p className="text-[13px] leading-snug text-hf-ink-soft">{expense.description}</p>
            </>
          )}
        </Paper>

        <div className="space-y-2">
          <Eyebrow>Категория</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {expenseCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  'rounded-[10px] px-3.5 py-2 text-[13px] transition-colors',
                  c.id === expense.category_id ? 'bg-hf-accent font-medium text-white' : 'bg-hf-card text-hf-text-3',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {monthCategory && (
          <div className="space-y-2.5 rounded-[16px] bg-hf-card p-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-[13px] text-hf-text-2">{monthCategory.name} за месяц</span>
              <span className={cn('font-mono text-[13px]', monthCategory.tone === 'warn' ? 'text-hf-warn-on-dark' : 'text-hf-text')}>
                {formatMoney(monthCategory.amount, expense.currency)}
              </span>
            </div>
            <ProgressBar pct={monthCategory.pct} tone={monthCategory.tone === 'warn' ? 'warn' : 'accent'} height={5} />
            {shareOfCategory != null && (
              <p className="text-[11px] leading-snug text-hf-text-4">
                Эта трата — {formatPercent(shareOfCategory)} от категории
                {month?.hasIncome ? ` и ${formatPercent(Math.min(1, expense.amount / (month.limit || 1)))} месячного лимита` : ''}.
              </p>
            )}
          </div>
        )}

        {(lowConfidence || !expense.is_confirmed) && (
          <div className="flex items-start gap-2.5 rounded-[14px] bg-hf-card p-3.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-hf-warn-on-dark" />
            <p className="text-[13px] leading-snug text-hf-text-2">
              {lowConfidence
                ? `Разобрал с уверенностью ${formatPercent(expense.ai_confidence!)} — проверь сумму и категорию.`
                : 'Пока не подтверждена: в лимит месяца считаю, но в «уточнить» она останется.'}
            </p>
          </div>
        )}
      </FormSheet>

      <ConfirmSheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Удалить трату?"
        description="Сумма уйдёт из лимита месяца и из категории. Отменить нельзя — чек придётся загрузить заново."
        confirmLabel="Удалить"
        pending={deleteExpense.isPending}
        onConfirm={remove}
      />
    </>
  )
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const hasTime = iso.includes('T') && !iso.endsWith('T00:00:00')
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}
