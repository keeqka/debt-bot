import { useState } from 'react'
import { toast } from 'sonner'
import { PiggyBank, Pencil, Landmark, PauseCircle } from 'lucide-react'
import { FormSheet } from '@/components/chrome/FormSheet'
import { Eyebrow } from '@/components/chrome/Chrome'
import { Paper } from '@/components/chrome/Paper'
import { ProgressBar } from '@/components/chrome/ProgressBar'
import { ConfirmSheet } from '@/components/chrome/ConfirmSheet'
import { useBankProducts, useUpdateGoal, useMonth } from '@/hooks/use-finance-data'
import { formatMoney, formatMoneyCompact, formatDate, formatPercent } from '@/lib/format'
import { goalMath, monthLabel } from '@/lib/goal'
import { AddGoalDialog } from '@/components/goals/AddGoalDialog'
import { ContributeDialog } from '@/components/goals/ContributeDialog'
import type { Goal } from '@/types/domain'

/**
 * Карточка цели целиком: цифры на бумаге, план и варианты вкладов — в тёмном.
 * Открывается из раздела «Цели» в «Обзоре». Здесь же живут все действия над
 * целью, поэтому в списке их нет: строка списка отвечает только на «как идут
 * дела», решения принимаются тут.
 */
export function GoalDetailSheet({ goal, open, onOpenChange }: { goal: Goal | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: bankProducts } = useBankProducts()
  const updateGoal = useUpdateGoal()
  const month = useMonth()
  const [editOpen, setEditOpen] = useState(false)
  const [contributeOpen, setContributeOpen] = useState(false)
  const [confirmPause, setConfirmPause] = useState(false)

  if (!goal) return null
  const math = goalMath(goal)
  const shareOfFree = month?.hasIncome && month.available > 0 && math.monthlyNeeded ? math.monthlyNeeded / month.available : null

  async function pause() {
    if (!goal) return
    await updateGoal.mutateAsync({ id: goal.id, patch: { status: 'paused' } })
    toast.success('Цель на паузе — цифры сохранены')
    setConfirmPause(false)
    onOpenChange(false)
  }

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={goal.title}
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setContributeOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white"
            >
              <PiggyBank className="h-4 w-4" />
              Пополнить
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Изменить цель"
              className="flex items-center justify-center rounded-[13px] bg-hf-card px-4 py-3.5 text-hf-text-2"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        }
      >
        <Paper className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2.5">
            <Eyebrow>{math.done ? 'Собрано' : 'Накоплено'}</Eyebrow>
            <span className="font-mono text-[11px] text-hf-ink-soft">
              {goal.target_date ? `до ${monthLabel(goal.target_date)}` : 'без срока'}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[30px] leading-none font-bold tracking-[-0.03em]">{formatMoney(goal.current_amount, goal.currency)}</span>
            <span className="font-mono text-[11px] text-hf-ink-soft">{formatPercent(math.pct / 100)}</span>
          </div>
          <ProgressBar pct={math.pct} onPaper />
          <div className="h-px bg-hf-receipt-line" />
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span>Цель</span>
            <span className="font-mono text-hf-accent-ink">{formatMoney(goal.target_amount, goal.currency)}</span>
          </div>
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span>Осталось собрать</span>
            <span className="font-mono">{formatMoney(math.left, goal.currency)}</span>
          </div>
        </Paper>

        <div className="space-y-2.5 rounded-[16px] bg-hf-card p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] text-hf-text-4">Откладывать в месяц</p>
              <p className="font-mono text-[15px] font-medium text-hf-text">
                {math.monthlyNeeded ? formatMoney(math.monthlyNeeded, goal.currency) : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-hf-text-4">Закроется</p>
              <p className="text-[15px] font-medium text-hf-text">
                {goal.ai_strategy?.estimated_completion_date
                  ? monthLabel(goal.ai_strategy.estimated_completion_date)
                  : goal.target_date
                    ? monthLabel(goal.target_date)
                    : '—'}
              </p>
            </div>
          </div>

          {shareOfFree != null && (
            <p className="text-[11px] leading-snug text-hf-text-4">
              Это {formatPercent(Math.min(1, shareOfFree))} свободных денег месяца — {formatMoneyCompact(month!.available, goal.currency)}.
              {shareOfFree > 1 && ' Сейчас столько не выходит: сдвинь срок или уменьши сумму.'}
            </p>
          )}
          {!math.fromStrategy && (
            <p className="text-[11px] leading-snug text-hf-text-4">Прикидка по сроку. Точный план со ставками вкладов посчитаю в ближайшем разборе.</p>
          )}
        </div>

        {goal.ai_strategy && goal.ai_strategy.bank_product_suggestions.length > 0 && (
          <div className="space-y-2">
            <Eyebrow>Где держать</Eyebrow>
            {goal.ai_strategy.bank_product_suggestions.map((s) => {
              const product = bankProducts?.find((p) => p.id === s.bank_product_id)
              if (!product) return null
              return (
                <div key={s.bank_product_id} className="flex items-start gap-2.5 rounded-[14px] bg-hf-card p-3.5">
                  <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-hf-text-4" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[13px] font-medium text-hf-text">
                      {product.bank_name} · {product.product_name}
                    </p>
                    <p className="text-[11px] leading-snug text-hf-text-4">
                      <span className="font-mono">{product.rate_percent}%</span> годовых · {s.reasoning}
                    </p>
                    <a
                      href={product.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-[11px] text-hf-accent-on-dark underline underline-offset-2"
                    >
                      проверить на сайте банка (данные на {formatDate(product.updated_at)})
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {goal.ai_strategy && goal.ai_strategy.risks.length > 0 && (
          <ul className="space-y-1.5">
            {goal.ai_strategy.risks.map((risk, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-snug text-hf-text-4">
                <span className="text-hf-warn-on-dark">·</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setConfirmPause(true)}
          className="flex w-full items-center justify-center gap-2 pt-1 text-[11px] text-hf-text-4"
        >
          <PauseCircle className="h-3.5 w-3.5" />
          Отложить цель
        </button>
      </FormSheet>

      <AddGoalDialog open={editOpen} onOpenChange={setEditOpen} goal={goal} />
      <ContributeDialog open={contributeOpen} onOpenChange={setContributeOpen} goal={goal} />
      <ConfirmSheet
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title="Отложить цель?"
        description="Цель уйдёт из «Обзора», но накопленное и срок сохранятся — вернуть можно в любой момент."
        confirmLabel="Отложить"
        pending={updateGoal.isPending}
        onConfirm={pause}
      />
    </>
  )
}
